import { useEffect, useRef, useState, type FormEvent } from "react";
import Admin from "./pages/admin";
import Member from "./pages/Member";
import SuperAdmin from "./pages/superadmin";
import { supabase } from "./lib/supabase";

export type UserRole = "super_admin" | "admin" | "member";
export type HouseholdRole = Exclude<UserRole, "super_admin">;

export type User = {
  id: string;
  name: string;
  role: UserRole;
  active: boolean;
  houseId: string | null;
  houseName?: string;
};

export type SpendingType =
  | "Mess"
  | "Home"
  | "Electricity Bill"
  | "Gas Bill"
  | "Internet Bill"
  | "Maintenance"
  | "Bike Petrol"
  | "Car Petrol"
  | "Personal"
  | "Others";

export type Spending = {
  id: number;
  userId: string;
  houseId?: string;
  date: string;
  description: string;
  quantity: string;
  type: SpendingType;
  amount: number;
  billFilePath?: string;
  billFileName?: string;
  billFileType?: string;
  createdAt?: string;
};

export type Budget = {
  id: number;
  userId: string;
  houseId?: string;
  month: number;
  year: number;
  amount: number;
  source?: string;
  budgetType: "own" | "user_allocation";
  allocatedBy?: string;
  allocatedAt?: string;
  budgetSlipFilePath?: string;
  budgetSlipFileName?: string;
  budgetSlipFileType?: string;
};

type Page = "home" | "superadmin" | "admin" | "member";
type AuthFlow = "login" | "forgot" | "recovery";

type RecoverySessionStatus = "checking" | "ready" | "missing";

function isPasswordRecoveryUrl() {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return (
    search.get("reset") === "password" ||
    search.get("type") === "recovery" ||
    hash.get("type") === "recovery"
  );
}

function getPageFromUrl(): Page {
  const page = new URLSearchParams(window.location.search).get("page");

  if (page === "admin") return "admin";
  if (page === "member") return "member";
  if (page === "superadmin") return "superadmin";
  return "home";
}

function App() {
  const [sessionReady, setSessionReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [page, setPage] = useState<Page>(getPageFromUrl());
  const [error, setError] = useState("");
  const recoveryFlowActive = useRef(isPasswordRecoveryUrl());
  const [authFlow, setAuthFlow] = useState<AuthFlow>(
    recoveryFlowActive.current ? "recovery" : "login",
  );
  const [recoverySessionStatus, setRecoverySessionStatus] =
    useState<RecoverySessionStatus>(
      recoveryFlowActive.current ? "checking" : "missing",
    );

  // Financial data is loaded from Supabase after authentication.
  const [spendings, setSpendings] = useState<Spending[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);

  const navigate = (nextPage: Page) => {
    window.history.pushState(
      {},
      "",
      `${window.location.pathname}?page=${nextPage}`,
    );
    setPage(nextPage);
  };

  const goHome = () => {
    window.history.pushState({}, "", window.location.pathname);
    setPage("home");
  };

  const loadProfile = async (userId: string) => {
    setError("");

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, role, active, house_id")
      .eq("id", userId)
      .single();

    if (profileError || !data) {
      setCurrentUser(null);
      setUsers([]);
      setError(profileError?.message ?? "Your profile was not found.");
      return;
    }

    const profile: User = {
      id: data.id,
      name: data.name,
      role: data.role,
      active: data.active,
      houseId: data.house_id,
    };

    if (!profile.active) {
      await supabase.auth.signOut();
      setCurrentUser(null);
      setUsers([]);
      setError("This account is inactive. Please contact an administrator.");
      return;
    }

    if (profile.role === "super_admin") {
      setCurrentUser(profile);
      setUsers([]);
      setBudgets([]);
      setSpendings([]);
      setPage("superadmin");
      return;
    }

    if (!profile.houseId) {
      await supabase.auth.signOut();
      setCurrentUser(null);
      setUsers([]);
      setError("This account is not assigned to a household. Ask an administrator to finish the household setup.");
      return;
    }

    const { data: houseRow } = await supabase
      .from("households")
      .select("name")
      .eq("id", profile.houseId)
      .maybeSingle();
    profile.houseName = houseRow?.name;

    setCurrentUser(profile);

    // Load financial records from Supabase.
    // RLS controls which rows the current user is allowed to receive.
    const { data: budgetRows, error: budgetsError } = await supabase
      .from("budgets")
      .select(
        "id, user_id, house_id, month, year, amount, source, budget_type, allocated_by, allocated_at, budget_slip_file_path, budget_slip_file_name, budget_slip_file_type",
      )
      .order("year", { ascending: true })
      .order("month", { ascending: true })
      .eq("house_id", profile.houseId);

    const { data: spendingRows, error: spendingsError } = await supabase
      .from("spendings")
      .select(
        "id, user_id, house_id, spending_date, description, quantity, type, amount, bill_file_path, bill_file_name, bill_file_type, created_at",
      )
      .order("spending_date", { ascending: true })
      .eq("house_id", profile.houseId);

    if (budgetsError || spendingsError) {
      setBudgets([]);
      setSpendings([]);
      setError(
        budgetsError?.message ??
          spendingsError?.message ??
          "Could not load financial records.",
      );
    } else {
      setBudgets(
        (budgetRows ?? []).map((row) => ({
          id: row.id,
          userId: row.user_id,
          houseId: row.house_id,
          month: row.month,
          year: row.year,
          amount: Number(row.amount),
          source: row.source ?? undefined,
          budgetType: row.budget_type,
          allocatedBy: row.allocated_by ?? undefined,
          allocatedAt: row.allocated_at ?? undefined,
          budgetSlipFilePath: row.budget_slip_file_path ?? undefined,
          budgetSlipFileName: row.budget_slip_file_name ?? undefined,
          budgetSlipFileType: row.budget_slip_file_type ?? undefined,
        })),
      );

      setSpendings(
        (spendingRows ?? []).map((row) => ({
          id: row.id,
          userId: row.user_id,
          houseId: row.house_id,
          date: row.spending_date,
          description: row.description,
          quantity: row.quantity,
          type: row.type,
          amount: Number(row.amount),
          billFilePath: row.bill_file_path ?? undefined,
          billFileName: row.bill_file_name ?? undefined,
          billFileType: row.bill_file_type ?? undefined,
          createdAt: row.created_at ?? undefined,
        })),
      );
    }

    // RLS allows admins to see all profiles and members to see their own profile.
    const { data: profileRows, error: usersError } = await supabase
      .from("profiles")
      .select("id, name, role, active, house_id")
      .eq("house_id", profile.houseId)
      .order("created_at", { ascending: true });

    if (usersError) {
      setUsers([profile]);
    } else {
      setUsers(
        (profileRows ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          role: row.role,
          active: row.active,
          houseId: row.house_id,
          houseName: profile.houseName,
        })) as User[],
      );
    }

    setPage(profile.role === "admin" ? "admin" : "member");
  };

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      const isRecoveryRedirect =
        recoveryFlowActive.current || isPasswordRecoveryUrl();
      if (isRecoveryRedirect) {
        recoveryFlowActive.current = true;
        setAuthFlow("recovery");
        setRecoverySessionStatus("checking");
        setCurrentUser(null);
        setUsers([]);
      }

      const { data } = await supabase.auth.getSession();

      if (!mounted) return;

      if (isRecoveryRedirect) {
        setAuthFlow("recovery");
        setCurrentUser(null);
        setUsers([]);
        let recoverySession = data.session;

        // The SDK processes the recovery URL during initialization. Recheck
        // after that processing has settled before reporting a missing session.
        if (!recoverySession?.user) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          const { data: refreshedSession } = await supabase.auth.getSession();
          recoverySession = refreshedSession.session;
        }

        if (!mounted) return;
        setRecoverySessionStatus(
          recoverySession?.user ? "ready" : "missing",
        );
      } else if (data.session?.user) {
        await loadProfile(data.session.user.id);
      } else {
        setCurrentUser(null);
        setUsers([]);
        setAuthFlow("login");
      }

      if (mounted) setSessionReady(true);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "INITIAL_SESSION") return;

      if (event === "PASSWORD_RECOVERY") {
        recoveryFlowActive.current = true;
        setAuthFlow("recovery");
        setRecoverySessionStatus(
          session?.user ? "ready" : "checking",
        );
        setCurrentUser(null);
        setUsers([]);
        return;
      }

      if (recoveryFlowActive.current) {
        if (session?.user) setRecoverySessionStatus("ready");
        return;
      }

      if (session?.user) {
        void loadProfile(session.user.id);
      } else {
        setCurrentUser(null);
        setUsers([]);
        setPage("home");
        setAuthFlow("login");
        setRecoverySessionStatus("missing");
      }
    });

    void initialize();

    const handlePopState = () => {
      setPage(getPageFromUrl());
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const handleLogout = async () => {
    const { error: logoutError } = await supabase.auth.signOut();
    if (logoutError) setError(logoutError.message);
  };

  const finishPasswordRecovery = async () => {
    recoveryFlowActive.current = false;
    await supabase.auth.signOut();
    window.history.replaceState({}, "", window.location.pathname);
    setRecoverySessionStatus("missing");
    setError("");
    setAuthFlow("login");
  };


  const updateUser = async (
    userId: string,
    updates: Partial<Pick<User, "active">> & { role?: HouseholdRole },
  ): Promise<void> => {
    if (userId === currentUser?.id) {
      setError("You cannot change your own role.");
      return;
    }

    const { data, error: updateError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select("id, name, role, active, house_id")
      .single();

    if (updateError || !data) {
      setError(updateError?.message ?? "Could not update user.");
      alert(
        `Could not update user: ${
          updateError?.message ?? "User was not updated."
        }`,
      );
      return;
    }

    const updatedUser: User = {
      id: data.id,
      name: data.name,
      role: data.role,
      active: data.active,
      houseId: data.house_id,
      houseName: currentUser?.houseName,
    };

    setUsers((current) =>
      current.map((user) =>
        user.id === userId ? updatedUser : user,
      ),
    );
  };

  const addUser = async ({
    name,
    email,
    password,
    role,
  }: {
    name: string;
    email: string;
    password: string;
    role: HouseholdRole;
  }): Promise<void> => {
    const { data, error: functionError } = await supabase.functions.invoke(
      "create-user",
      {
        body: {
          name,
          email,
          password,
          role,
        },
      },
    );

    if (functionError) {
      let message = functionError.message;

      const context = (functionError as { context?: unknown }).context;

      if (context instanceof Response) {
        try {
          const responseBody = await context.json();

          if (responseBody?.error) {
            message = responseBody.error;
          }
        } catch {
          // Keep the original function error message.
        }
      }

      throw new Error(message);
    }

    if (!data?.user) {
      throw new Error("User was not created. No profile was returned.");
    }

    const newUser: User = {
      id: data.user.id,
      name: data.user.name,
      role: data.user.role,
      active: data.user.active,
      houseId: currentUser?.houseId ?? data.user.house_id,
      houseName: currentUser?.houseName,
    };

    setUsers((current) => [...current, newUser]);
  };

  const removeUser = async (userId: string): Promise<void> => {
    if (userId === currentUser?.id) {
      throw new Error("You cannot deactivate yourself.");
    }

    const { data, error: removeError } = await supabase
      .from("profiles")
      .update({ active: false })
      .eq("id", userId)
      .select("id, name, role, active, house_id")
      .single();

    if (removeError || !data) {
      throw new Error(removeError?.message ?? "Could not deactivate this user.");
    }

    setUsers((current) =>
      current.map((user) =>
        user.id === userId
          ? {
              id: data.id,
              name: data.name,
              role: data.role,
              active: data.active,
              houseId: data.house_id,
              houseName: currentUser?.houseName,
            }
          : user,
      ),
    );
  };

  const deleteUser = async (userId: string): Promise<void> => {
    if (userId === currentUser?.id) {
      throw new Error("You cannot delete yourself.");
    }

    const { data, error: functionError } = await supabase.functions.invoke(
      "delete-user",
      { body: { userId } },
    );

    if (functionError) {
      let message = functionError.message;
      const context = (functionError as { context?: unknown }).context;
      if (context instanceof Response) {
        try {
          const body = await context.json();
          if (body?.error) message = body.error;
        } catch {
          // Keep original message.
        }
      }
      throw new Error(message);
    }

    if (!data?.success) {
      throw new Error(data?.error ?? "User could not be deleted.");
    }

    setUsers((current) => current.filter((user) => user.id !== userId));
    setBudgets((current) => current.filter((budget) => budget.userId !== userId));
    setSpendings((current) => current.filter((spending) => spending.userId !== userId));
  };

  if (!sessionReady) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    if (authFlow === "forgot") {
      return (
        <ForgotPasswordScreen
          onBack={() => {
            setError("");
            setAuthFlow("login");
          }}
        />
      );
    }

    if (authFlow === "recovery") {
      return (
        <UpdatePasswordScreen
          recoverySessionStatus={recoverySessionStatus}
          onComplete={finishPasswordRecovery}
        />
      );
    }

    return (
      <LoginScreen
        error={error}
        onLoginSuccess={loadProfile}
        onForgotPassword={() => {
          setError("");
          setAuthFlow("forgot");
        }}
      />
    );
  }

  // Super Admins remain on the global management dashboard for every page URL.
  if (currentUser.role === "super_admin") {
    return <SuperAdmin currentUser={currentUser} onLogout={handleLogout} />;
  }

  if (page === "admin") {
    if (currentUser.role !== "admin") {
      return (
        <AccessDenied
          title="Admin access required"
          message="This account does not currently have administrator permissions."
          onHome={goHome}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <Admin
        currentUser={currentUser}
        users={users}
        budgets={budgets}
        spendings={spendings}
        onBackHome={goHome}
        onAddUser={addUser}
        onUpdateUser={updateUser}
        onRemoveUser={removeUser}
        onDeleteUser={deleteUser}
        onBudgetsChange={setBudgets}
        onSpendingsChange={setSpendings}
      />
    );
  }

  if (page === "member") {
    if (currentUser.role !== "member") {
      return (
        <AccessDenied
          title="Member access required"
          message="Administrator accounts use the Admin dashboard."
          onHome={goHome}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <Member
  user={currentUser}
  budgets={budgets}
  spendings={spendings}
  onBackHome={goHome}
  onBudgetsChange={setBudgets}
  onSpendingsChange={setSpendings}
/>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5 mb-10">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Expense Management
            </h1>
            <p className="text-slate-500 mt-2">
              Welcome, {currentUser.name}
            </p>
            {currentUser.houseName && (
              <p className="text-sm font-medium text-blue-700 mt-1">
                {currentUser.houseName}
              </p>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="px-5 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold"
          >
            Logout
          </button>
        </div>

        <button
          onClick={() => navigate(currentUser.role === "admin" ? "admin" : "member")}
          className="text-left bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 transition w-full max-w-md"
        >
          <div className="flex items-center justify-between">
            <div className="w-14 h-14 rounded-full bg-slate-900 text-white flex items-center justify-center text-xl font-bold">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                currentUser.role === "admin"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {currentUser.role === "admin" ? "Admin" : "Member"}
            </span>
          </div>

          <h2 className="text-xl font-bold text-slate-900 mt-6">
            {currentUser.name}
          </h2>

          <p className="text-slate-500 mt-1">
            {currentUser.role === "admin"
              ? "Administrator Dashboard"
              : "Personal Expense Dashboard"}
          </p>

          <div className="mt-6 text-sm font-semibold text-slate-900">
            Open Dashboard →
          </div>
        </button>

        {error && (
          <div className="mt-6 max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
        <h1 className="text-xl font-bold text-slate-900">
          Loading Expense Management...
        </h1>
        <p className="text-slate-500 mt-2">Checking your account.</p>
      </div>
    </div>
  );
}

function LoginScreen({
  error: initialError,
  onLoginSuccess,
  onForgotPassword,
}: {
  error: string;
  onLoginSuccess: (userId: string) => Promise<void>;
  onForgotPassword: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (loginError) {
      setError(loginError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await onLoginSuccess(data.user.id);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-slate-900 text-white flex items-center justify-center text-2xl font-bold">
            E
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-5">
            Expense Management
          </h1>
          <p className="text-slate-500 mt-2">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:border-slate-500"
              placeholder="Enter your email"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:border-slate-500"
              placeholder="Enter your password"
              autoComplete="current-password"
            />

            <button
              type="button"
              onClick={onForgotPassword}
              className="mt-2 text-sm font-semibold text-slate-700 hover:underline"
            >
              Forgot password?
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white rounded-xl py-3 font-semibold disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ForgotPasswordScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    const redirectTo = `${window.location.origin}/?reset=password`;

    const { error: resetError } =
      await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage(
      "If an account exists for that email, a password reset link has been sent. Check your inbox.",
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 w-full max-w-md p-8">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-semibold text-slate-700 mb-6"
        >
          ← Back to Sign In
        </button>

        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-slate-900 text-white flex items-center justify-center text-2xl font-bold">
            E
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-5">
            Reset Password
          </h1>
          <p className="text-slate-500 mt-2">
            Enter your account email and we'll send you a reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:border-slate-500"
              placeholder="Enter your email"
              autoComplete="email"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white rounded-xl py-3 font-semibold disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
      </div>
    </div>
  );
}

function UpdatePasswordScreen({
  recoverySessionStatus,
  onComplete,
}: {
  recoverySessionStatus: RecoverySessionStatus;
  onComplete: () => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (recoverySessionStatus !== "ready") {
      setError(
        recoverySessionStatus === "checking"
          ? "Please wait while we verify your reset link."
          : "This password reset link is invalid or expired. Request a new one and try again.",
      );
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);

    window.setTimeout(() => {
      void onComplete();
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-slate-900 text-white flex items-center justify-center text-2xl font-bold">
            E
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-5">
            Set New Password
          </h1>
          <p className="text-slate-500 mt-2">
            Choose a new password for your account.
          </p>
        </div>

        {recoverySessionStatus !== "ready" && (
          <div
            className={`mb-5 rounded-xl border p-4 text-sm ${
              recoverySessionStatus === "checking"
                ? "border-blue-200 bg-blue-50 text-blue-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
            role="status"
          >
            {recoverySessionStatus === "checking"
              ? "Verifying your password reset link…"
              : "A recovery session could not be established. Request a new reset link."}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:border-slate-500"
              placeholder="Minimum 6 characters"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:border-slate-500"
              placeholder="Enter password again"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              Password updated successfully. Returning to sign in...
            </div>
          )}

          <button
            type="submit"
            disabled={loading || success || recoverySessionStatus !== "ready"}
            className="w-full bg-slate-900 text-white rounded-xl py-3 font-semibold disabled:opacity-60"
          >
            {loading
              ? "Updating..."
              : recoverySessionStatus === "checking"
                ? "Verifying reset link..."
                : recoverySessionStatus === "missing"
                  ? "Reset link unavailable"
                  : "Update Password"}
          </button>
        </form>

        {recoverySessionStatus === "missing" && (
          <button
            type="button"
            onClick={() => void onComplete()}
            className="mt-4 w-full text-sm font-semibold text-slate-700 hover:underline"
          >
            Back to Sign In
          </button>
        )}
      </div>
    </div>
  );
}

function AccessDenied({
  title,
  message,
  onHome,
  onLogout,
}: {
  title: string;
  message: string;
  onHome: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center max-w-md w-full">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-500 mt-2">{message}</p>
        <div className="flex gap-3 justify-center mt-6">
          <button
            onClick={onHome}
            className="px-5 py-3 rounded-xl bg-slate-900 text-white font-semibold"
          >
            ← Home
          </button>
          <button
            onClick={onLogout}
            className="px-5 py-3 rounded-xl border border-slate-300 text-slate-900 font-semibold"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
