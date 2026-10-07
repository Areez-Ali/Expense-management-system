BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_admin_budget_allocation_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_house_id uuid;
  v_actor_role text;
  v_actor_active boolean;
  v_own_budgets numeric;
  v_received_allocations numeric;
  v_outgoing_allocations numeric;
  v_available_funds numeric;
BEGIN
  -- Updating non-financial fields on an existing allocation does not change
  -- the amount being transferred, so leave historical rows editable.
  IF TG_OP = 'UPDATE'
    AND ROW(
      NEW.user_id,
      NEW.house_id,
      NEW.month,
      NEW.year,
      NEW.amount,
      NEW.budget_type,
      NEW.allocated_by
    ) IS NOT DISTINCT FROM ROW(
      OLD.user_id,
      OLD.house_id,
      OLD.month,
      OLD.year,
      OLD.amount,
      OLD.budget_type,
      OLD.allocated_by
    ) THEN
    RETURN NEW;
  END IF;

  IF NEW.budget_type IS DISTINCT FROM 'user_allocation' THEN
    RETURN NEW;
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_actor_id IS NULL OR NEW.allocated_by IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'Only the signed-in Admin can allocate their own available funds.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Serialize allocations by the same Admin so concurrent requests cannot
  -- both spend the same available balance.
  SELECT p.house_id, p.role::text, p.active
  INTO v_actor_house_id, v_actor_role, v_actor_active
  FROM public.profiles AS p
  WHERE p.id = v_actor_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_actor_role IS DISTINCT FROM 'admin'
    OR v_actor_active IS DISTINCT FROM TRUE
    OR v_actor_house_id IS DISTINCT FROM NEW.house_id THEN
    RAISE EXCEPTION 'An active Admin can only allocate funds within their own household.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT
    COALESCE(SUM(b.amount) FILTER (
      WHERE b.budget_type = 'own' AND b.user_id = v_actor_id
    ), 0),
    COALESCE(SUM(b.amount) FILTER (
      WHERE b.budget_type = 'user_allocation' AND b.user_id = v_actor_id
    ), 0),
    COALESCE(SUM(b.amount) FILTER (
      WHERE b.budget_type = 'user_allocation' AND b.allocated_by = v_actor_id
    ), 0)
  INTO v_own_budgets, v_received_allocations, v_outgoing_allocations
  FROM public.budgets AS b
  WHERE b.house_id = NEW.house_id
    AND b.month = NEW.month
    AND b.year = NEW.year
    AND b.id IS DISTINCT FROM NEW.id;

  v_available_funds :=
    v_own_budgets + v_received_allocations - v_outgoing_allocations;

  IF NEW.amount > v_available_funds THEN
    RAISE EXCEPTION
      'Insufficient funds. Available to allocate: Rs. %; requested: Rs. %.',
      v_available_funds,
      NEW.amount
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_admin_budget_allocation_balance()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_admin_budget_allocation_balance
  ON public.budgets;

CREATE TRIGGER enforce_admin_budget_allocation_balance
  BEFORE INSERT OR UPDATE ON public.budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_admin_budget_allocation_balance();

COMMIT;
