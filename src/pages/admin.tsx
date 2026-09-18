import { useMemo, useState, type ChangeEvent, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type {
  Budget,
  Spending,
  SpendingType,
  User,
  UserRole,
} from "../App";
import { supabase } from "../lib/supabase";


async function viewBill(path: string) {
  const { data, error } = await supabase.storage
    .from("bills")
    .createSignedUrl(path, 60);

  if (error || !data?.signedUrl) {
    alert(`Could not open bill: ${error?.message ?? "File URL was not created."}`);
    return;
  }

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function getSafeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

type Props = {
  currentUser: User;
  users: User[];
  budgets: Budget[];
  spendings: Spending[];

  onBackHome: () => void;

  onAddUser: (payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }) => void | Promise<void>;
  onUpdateUser: (
    userId: string,
    updates: Partial<User>,
  ) => void | Promise<void>;
  onRemoveUser: (userId: string) => void | Promise<void>;
  onDeleteUser: (userId: string) => void | Promise<void>;


  onBudgetsChange: Dispatch<SetStateAction<Budget[]>>;
  onSpendingsChange: Dispatch<SetStateAction<Spending[]>>;
};

const spendingTypes: SpendingType[] = [
  "Mess",
  "Home",
  "Electricity Bill",
  "Gas Bill",
  "Internet Bill",
  "Maintenance",
  "Bike Petrol",
  "Car Petrol",
  "Personal",
  "Others",
];

const globalCategories: SpendingType[] = [
  "Mess",
  "Home",
  "Electricity Bill",
  "Gas Bill",
  "Internet Bill",
  "Maintenance",
  "Bike Petrol",
  "Car Petrol",
  "Others",
];

type MonthOption = {
  month: number;
  year: number;
  label: string;
};

function getMonthOptions(count = 12): MonthOption[] {
  const now = new Date();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      now.getFullYear(),
      now.getMonth() + index,
      1,
    );

    return {
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      label: date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
    };
  });
}

function formatMoney(value: number) {
  return `Rs. ${value.toLocaleString("en-PK")}`;
}

function getInitialDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function Admin({
  currentUser,
  users,
  budgets,
  spendings,
  onBackHome,
  onAddUser,
  onUpdateUser,
  onRemoveUser,
  onDeleteUser,
  onBudgetsChange,
  onSpendingsChange,
}: Props) {
  const monthOptions = useMemo(() => getMonthOptions(12), []);

  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]);

  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);

  const [budgetMode, setBudgetMode] = useState<"own" | "user">("own");

  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetSource, setBudgetSource] = useState("");
  const [budgetUserId, setBudgetUserId] = useState("");

  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("member");

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [filterType, setFilterType] = useState<SpendingType | "all">("all");
  const [filterUserId, setFilterUserId] = useState("all");
  const [filterMonth, setFilterMonth] = useState("selected");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");

  const [editingSpendingId, setEditingSpendingId] = useState<number | null>(
    null,
  );

  const [showSpendingModal, setShowSpendingModal] = useState(false);

  const [spendingDate, setSpendingDate] = useState(getInitialDate());
  const [spendingDescription, setSpendingDescription] = useState("");
  const [spendingQuantity, setSpendingQuantity] = useState("");
  const [spendingType, setSpendingType] =
    useState<SpendingType>("Others");
  const [spendingAmount, setSpendingAmount] = useState("");
  const [billFile, setBillFile] = useState<File | null>(null);

  const [selectedCategory, setSelectedCategory] =
    useState<SpendingType | null>(null);

  const [selectedDetailUserId, setSelectedDetailUserId] =
    useState<string | null>(null);

  const monthBudgets = budgets.filter(
    (budget) =>
      budget.month === selectedMonth.month &&
      budget.year === selectedMonth.year,
  );

  const monthSpendings = spendings.filter((spending) => {
    const date = new Date(`${spending.date}T00:00:00`);

    return (
      date.getMonth() + 1 === selectedMonth.month &&
      date.getFullYear() === selectedMonth.year
    );
  });

  const filteredSpendings = spendings.filter((spending) => {
    const date = new Date(`${spending.date}T00:00:00`);
    const matchesType = filterType === "all" || spending.type === filterType;
    const matchesUser = filterUserId === "all" || spending.userId === filterUserId;
    const matchesMonth =
      filterMonth === "all" ||
      (filterMonth === "selected" &&
        date.getMonth() + 1 === selectedMonth.month &&
        date.getFullYear() === selectedMonth.year) ||
      (filterMonth !== "selected" &&
        filterMonth !== "all" &&
        `${date.getFullYear()}-${date.getMonth() + 1}` === filterMonth);
    const matchesFrom = !filterFromDate || spending.date >= filterFromDate;
    const matchesTo = !filterToDate || spending.date <= filterToDate;
    return matchesType && matchesUser && matchesMonth && matchesFrom && matchesTo;
  }).sort((a, b) => b.date.localeCompare(a.date));

  const filteredTotal = filteredSpendings.reduce((sum, item) => sum + item.amount, 0);

  // An "own" budget creates money in the overall budget pool.
  // A "user_allocation" transfers money from the allocating admin to a user,
  // so it must NOT increase the global budget a second time.
  const totalBudget = monthBudgets
    .filter((budget) => budget.budgetType === "own")
    .reduce((sum, budget) => sum + budget.amount, 0);

  const totalSpendings = monthSpendings.reduce(
    (sum, spending) => sum + spending.amount,
    0,
  );

  const globalBalance = totalBudget - totalSpendings;

  const myOwnBudgets = monthBudgets.filter(
    (budget) =>
      budget.budgetType === "own" &&
      budget.userId === currentUser.id,
  );

  const myAllocations = monthBudgets.filter(
    (budget) =>
      budget.budgetType === "user_allocation" &&
      budget.allocatedBy === currentUser.id,
  );

  const myReceivedAllocations = monthBudgets.filter(
    (budget) =>
      budget.budgetType === "user_allocation" &&
      budget.userId === currentUser.id,
  );

  const mySpendings = monthSpendings.filter(
    (spending) => spending.userId === currentUser.id,
  );

  const myBudget =
    myOwnBudgets.reduce((sum, budget) => sum + budget.amount, 0) -
    myAllocations.reduce((sum, budget) => sum + budget.amount, 0) +
    myReceivedAllocations.reduce((sum, budget) => sum + budget.amount, 0);

  const mySpending = mySpendings.reduce(
    (sum, spending) => sum + spending.amount,
    0,
  );

  const myBalance = myBudget - mySpending;

  const getUserFinancials = (userId: string) => {
    const ownBudget = monthBudgets
      .filter(
        (budget) =>
          budget.budgetType === "own" && budget.userId === userId,
      )
      .reduce((sum, budget) => sum + budget.amount, 0);

    const receivedAllocations = monthBudgets
      .filter(
        (budget) =>
          budget.budgetType === "user_allocation" &&
          budget.userId === userId,
      )
      .reduce((sum, budget) => sum + budget.amount, 0);

    const outgoingAllocations = monthBudgets
      .filter(
        (budget) =>
          budget.budgetType === "user_allocation" &&
          budget.allocatedBy === userId,
      )
      .reduce((sum, budget) => sum + budget.amount, 0);

    const spending = monthSpendings
      .filter((item) => item.userId === userId)
      .reduce((sum, item) => sum + item.amount, 0);

    const budget = ownBudget + receivedAllocations - outgoingAllocations;
    const balance = budget - spending;

    return {
      budget,
      spending,
      balance,
      debt: Math.max(0, -balance),
    };
  };

  const getUserName = (userId: string) =>
    users.find((user) => user.id === userId)?.name ?? "Unknown User";

  const categoryTotal = (category: SpendingType) =>
    monthSpendings
      .filter((spending) => spending.type === category)
      .reduce((sum, spending) => sum + spending.amount, 0);

  const selectedCategorySpendings = selectedCategory
    ? monthSpendings.filter(
        (spending) => spending.type === selectedCategory,
      )
    : [];

  const selectedDetailUser = selectedDetailUserId
    ? users.find((user) => user.id === selectedDetailUserId)
    : null;

  const selectedUserSpendings = selectedDetailUserId
    ? monthSpendings.filter(
        (spending) => spending.userId === selectedDetailUserId,
      )
    : [];

  const selectedUserFinancials = selectedDetailUserId
    ? getUserFinancials(selectedDetailUserId)
    : { budget: 0, spending: 0, balance: 0, debt: 0 };

  // Use the same net financial calculation as the main Admin dashboard.
  // This subtracts outgoing allocations from the user's own budget.
  const selectedUserBudgetTotal = selectedUserFinancials.budget;

  const selectedUserSpendingTotal = selectedUserSpendings.reduce(
    (sum, spending) => sum + spending.amount,
    0,
  );

  const selectedUserBalance =
    selectedUserBudgetTotal - selectedUserSpendingTotal;

  const closeBudgetModal = () => {
    setShowBudgetModal(false);
    setBudgetAmount("");
    setBudgetSource("");
    setBudgetUserId("");
    setBudgetMode("own");
  };

  const saveBudget = async () => {
    const amount = Number(budgetAmount);

    if (!amount || amount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    if (budgetMode === "own") {
      if (!budgetSource.trim()) {
        alert("Please enter the source.");
        return;
      }

      const { data, error } = await supabase
        .from("budgets")
        .insert({
          user_id: currentUser.id,
          month: selectedMonth.month,
          year: selectedMonth.year,
          amount,
          budget_type: "own",
          source: budgetSource.trim(),
        })
        .select("id, user_id, month, year, amount, source, budget_type, allocated_by, allocated_at")
        .single();

      if (error) {
        alert(`Could not save budget: ${error.message}`);
        return;
      }

      const newBudget: Budget = {
        id: data.id,
        userId: data.user_id,
        month: data.month,
        year: data.year,
        amount: Number(data.amount),
        source: data.source ?? undefined,
        budgetType: data.budget_type,
        allocatedBy: data.allocated_by ?? undefined,
        allocatedAt: data.allocated_at ?? undefined,
      };

      onBudgetsChange((current) => [...current, newBudget]);
    } else {
      const userId = budgetUserId;

      if (!userId) {
        alert("Please select a user.");
        return;
      }

      const availableToAllocate = Math.max(0, myBalance);

      if (amount > availableToAllocate) {
        alert(
          `Insufficient amount. You only have ${formatMoney(availableToAllocate)} remaining available to allocate for ${selectedMonth.label}.`,
        );
        return;
      }

      const { data, error } = await supabase
        .from("budgets")
        .insert({
          user_id: userId,
          month: selectedMonth.month,
          year: selectedMonth.year,
          amount,
          budget_type: "user_allocation",
          source: null,
          allocated_by: currentUser.id,
        })
        .select("id, user_id, month, year, amount, source, budget_type, allocated_by, allocated_at")
        .single();

      if (error) {
        alert(`Could not allocate budget: ${error.message}`);
        return;
      }

      const newBudget: Budget = {
        id: data.id,
        userId: data.user_id,
        month: data.month,
        year: data.year,
        amount: Number(data.amount),
        source: data.source ?? undefined,
        budgetType: data.budget_type,
        allocatedBy: data.allocated_by ?? undefined,
        allocatedAt: data.allocated_at ?? undefined,
      };

      onBudgetsChange((current) => [...current, newBudget]);
    }

    closeBudgetModal();
  };

  const deleteBudget = async (budgetId: number) => {
    const budget = budgets.find((item) => item.id === budgetId);

    if (!budget) {
      alert("Budget allocation was not found.");
      return;
    }

    if (budget.budgetType === "user_allocation") {
      const allocationTime = budget.allocatedAt
        ? new Date(budget.allocatedAt).getTime()
        : null;

      const allocationHasBeenUsed = spendings.some((spending) => {
        if (spending.userId !== budget.userId) return false;

        const spendingDate = new Date(`${spending.date}T00:00:00`);
        if (
          spendingDate.getMonth() + 1 !== budget.month ||
          spendingDate.getFullYear() !== budget.year
        ) {
          return false;
        }

        if (!allocationTime || !spending.createdAt) return true;

        return new Date(spending.createdAt).getTime() >= allocationTime;
      });

      if (allocationHasBeenUsed) {
        alert(
          "This allocation cannot be removed because the user has already used money from it.",
        );
        return;
      }
    }

    if (!confirm("Delete this budget allocation?")) return;

    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("id", budgetId);

    if (error) {
      alert(`Could not delete budget: ${error.message}`);
      return;
    }

    onBudgetsChange((current) =>
      current.filter((item) => item.id !== budgetId),
    );
  };

  const addUser = async () => {
    const name = newUserName.trim();
    const email = newUserEmail.trim().toLowerCase();
    const password = newUserPassword;

    if (!name) {
      alert("Please enter a user name.");
      return;
    }

    if (/\d/.test(name)) {
      alert("User name cannot contain numbers.");
      return;
    }

    if (!email) {
      alert("Please enter an email address.");
      return;
    }

    if (!email.includes("@")) {
      alert("Please enter a valid email address.");
      return;
    }

    if (!password) {
      alert("Please enter a password.");
      return;
    }

    if (password.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    try {
      await onAddUser({
        name,
        email,
        password,
        role: newUserRole,
      });

      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("member");
      setShowUserModal(false);
    } catch (error) {
      alert(
        `Could not create user: ${
          error instanceof Error ? error.message : "Unexpected error."
        }`,
      );
    }
  };

  const handleDeactivateUser = async (user: User) => {
    if (user.id === currentUser.id) {
      alert("You cannot deactivate yourself.");
      return;
    }

    const adminCount = users.filter((item) => item.active && item.role === "admin").length;
    if (user.role === "admin" && adminCount <= 1) {
      alert("You cannot deactivate the last administrator.");
      return;
    }

    if (!confirm(`Deactivate ${user.name}? Their financial history will be preserved.`)) return;

    try {
      await onRemoveUser(user.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not deactivate user.");
    }
  };

  const handleReactivateUser = async (user: User) => {
    try {
      await onUpdateUser(user.id, { active: true });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not reactivate user.");
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.id === currentUser.id) {
      alert("You cannot delete yourself.");
      return;
    }

    const adminCount = users.filter(
      (item) => item.active && item.role === "admin",
    ).length;

    if (user.active && user.role === "admin" && adminCount <= 1) {
      alert("You cannot delete the last active administrator.");
      return;
    }

    const hasSpendings = spendings.some((spending) => spending.userId === user.id);
    const message = hasSpendings
      ? `Delete ${user.name} permanently? This user's account, all spending records from every month, budgets and uploaded bills will be permanently removed. This cannot be undone.`
      : `Delete ${user.name} permanently? This will permanently remove the user's account and data. This cannot be undone.`;

    if (!confirm(message)) return;

    try {
      await onDeleteUser(user.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not delete user.");
    }
  };


  const toggleAdmin = (user: User) => {
    if (user.id === currentUser.id) {
      alert("You cannot change your own role.");
      return;
    }

    if (user.role === "admin") {
      const adminCount = users.filter(
        (item) => item.active && item.role === "admin",
      ).length;

      if (adminCount <= 1) {
        alert("At least one administrator must remain.");
        return;
      }

      onUpdateUser(user.id, { role: "member" });
    } else {
      onUpdateUser(user.id, { role: "admin" });
    }
  };

  const exportMonthlyReport = () => {
    const rows = [
      ["User", "Date", "Description", "Quantity", "Type", "Amount"],
      ...monthSpendings.map((item) => [
        getUserName(item.userId),
        item.date,
        item.description,
        item.quantity,
        item.type,
        String(item.amount),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `expense-report-${selectedMonth.year}-${String(selectedMonth.month).padStart(2, "0")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const savePassword = async () => {
    if (newPassword.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({
  password: newPassword,
});

if (error) {
  throw new Error(error.message);
}
      alert("Password changed successfully.");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordModal(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not change password.");
    }
  };

  const openSpendingModal = (spending?: Spending) => {
    if (spending) {
      setEditingSpendingId(spending.id);
      setSpendingDate(spending.date);
      setSpendingDescription(spending.description);
      setSpendingQuantity(spending.quantity);
      setSpendingType(spending.type);
      setSpendingAmount(String(spending.amount));
      setBillFile(null);
    } else {
      setEditingSpendingId(null);
      setSpendingDate(getInitialDate());
      setSpendingDescription("");
      setSpendingQuantity("");
      setSpendingType("Others");
      setSpendingAmount("");
      setBillFile(null);
    }

    setShowSpendingModal(true);
  };

  const closeSpendingModal = () => {
    setShowSpendingModal(false);
    setEditingSpendingId(null);
    setBillFile(null);
  };

  const handleBillFileChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setBillFile(null);
      return;
    }

    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      alert("Please select an image or PDF file.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Bill file must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }

    setBillFile(file);
  };

  const saveSpending = async () => {
    const amount = Number(spendingAmount);

    if (!spendingDate) {
      alert("Please select a date.");
      return;
    }

    if (!spendingDescription.trim()) {
      alert("Please enter a description.");
      return;
    }

    if (!spendingQuantity.trim()) {
      alert("Please enter quantity.");
      return;
    }

    if (!amount || amount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    if (editingSpendingId !== null) {
      const oldSpending = spendings.find((spending) => spending.id === editingSpendingId);
      let uploadedPath: string | null = null;

      if (billFile) {
        uploadedPath = `${currentUser.id}/${crypto.randomUUID()}-${getSafeFileName(billFile.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("bills")
          .upload(uploadedPath, billFile, {
            contentType: billFile.type,
            upsert: false,
          });

        if (uploadError) {
          alert(`Could not upload bill: ${uploadError.message}`);
          return;
        }
      }

      const updatePayload: Record<string, unknown> = {
        spending_date: spendingDate,
        description: spendingDescription.trim(),
        quantity: spendingQuantity.trim(),
        type: spendingType,
        amount,
      };

      if (uploadedPath) {
        updatePayload.bill_file_path = uploadedPath;
        updatePayload.bill_file_name = billFile?.name ?? null;
        updatePayload.bill_file_type = billFile?.type ?? null;
      }

      const { data, error } = await supabase
        .from("spendings")
        .update(updatePayload)
        .eq("id", editingSpendingId)
        .eq("user_id", currentUser.id)
        .select("id, user_id, spending_date, description, quantity, type, amount, bill_file_path, bill_file_name, bill_file_type, created_at")
        .single();

      if (error) {
        if (uploadedPath) await supabase.storage.from("bills").remove([uploadedPath]);
        alert(`Could not update spending: ${error.message}`);
        return;
      }

      if (billFile && oldSpending?.billFilePath && oldSpending.billFilePath !== data.bill_file_path) {
        await supabase.storage.from("bills").remove([oldSpending.billFilePath]);
      }

      const updatedSpending: Spending = {
        id: data.id,
        userId: data.user_id,
        date: data.spending_date,
        description: data.description,
        quantity: data.quantity,
        type: data.type,
        amount: Number(data.amount),
        billFilePath: data.bill_file_path ?? undefined,
        billFileName: data.bill_file_name ?? undefined,
        billFileType: data.bill_file_type ?? undefined,
        createdAt: data.created_at ?? undefined,
      };

      onSpendingsChange((current) =>
        current.map((spending) =>
          spending.id === editingSpendingId ? updatedSpending : spending,
        ),
      );
    } else {
      const { data, error } = await supabase
        .from("spendings")
        .insert({
          user_id: currentUser.id,
          spending_date: spendingDate,
          description: spendingDescription.trim(),
          quantity: spendingQuantity.trim(),
          type: spendingType,
          amount,
        })
        .select("id, user_id, spending_date, description, quantity, type, amount, bill_file_path, bill_file_name, bill_file_type, created_at")
        .single();

      if (error) {
        alert(`Could not save spending: ${error.message}`);
        return;
      }

      let billFilePath: string | null = null;

      if (billFile) {
        billFilePath = `${currentUser.id}/${data.id}-${crypto.randomUUID()}-${getSafeFileName(billFile.name)}`;

        const { error: uploadError } = await supabase.storage
          .from("bills")
          .upload(billFilePath, billFile, {
            contentType: billFile.type,
            upsert: false,
          });

        if (uploadError) {
          await supabase.from("spendings").delete().eq("id", data.id).eq("user_id", currentUser.id);
          alert(`Could not upload bill: ${uploadError.message}`);
          return;
        }

        const { data: updatedData, error: fileUpdateError } = await supabase
          .from("spendings")
          .update({
            bill_file_path: billFilePath,
            bill_file_name: billFile.name,
            bill_file_type: billFile.type,
          })
          .eq("id", data.id)
          .eq("user_id", currentUser.id)
          .select("id, user_id, spending_date, description, quantity, type, amount, bill_file_path, bill_file_name, bill_file_type, created_at")
          .single();

        if (fileUpdateError) {
          await supabase.storage.from("bills").remove([billFilePath]);
          await supabase.from("spendings").delete().eq("id", data.id).eq("user_id", currentUser.id);
          alert(`Could not save bill information: ${fileUpdateError.message}`);
          return;
        }

        Object.assign(data, updatedData);
      }

      const newSpending: Spending = {
        id: data.id,
        userId: data.user_id,
        date: data.spending_date,
        description: data.description,
        quantity: data.quantity,
        type: data.type,
        amount: Number(data.amount),
        billFilePath: data.bill_file_path ?? undefined,
        billFileName: data.bill_file_name ?? undefined,
        billFileType: data.bill_file_type ?? undefined,
        createdAt: data.created_at ?? undefined,
      };

      onSpendingsChange((current) => [...current, newSpending]);
    }

    closeSpendingModal();
  };

  const deleteSpending = async (id: number) => {
    if (!confirm("Delete this spending?")) return;

    const spending = spendings.find((item) => item.id === id);

    const { error } = await supabase
      .from("spendings")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) {
      alert(`Could not delete spending: ${error.message}`);
      return;
    }

    if (spending?.billFilePath) {
      await supabase.storage.from("bills").remove([spending.billFilePath]);
    }

    onSpendingsChange((current) =>
      current.filter((item) => item.id !== id),
    );
  };

  if (selectedCategory) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <button
            onClick={() => setSelectedCategory(null)}
            className="text-sm font-semibold text-slate-700 mb-6"
          >
            ← Back to Month
          </button>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">
              {selectedCategory}
            </h1>

            <p className="text-slate-500 mt-1">
              {selectedMonth.label}
            </p>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-3">User</th>
                    <th className="py-3">Date</th>
                    <th className="py-3">Description</th>
                    <th className="py-3">Quantity</th>
                    <th className="py-3">Type</th>
                    <th className="py-3">Bill</th>
                    <th className="py-3 text-right">Amount</th>
                  </tr>
                </thead>

                <tbody>
                  {selectedCategorySpendings
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((spending) => (
                      <tr
                        key={spending.id}
                        className="border-b last:border-0"
                      >
                        <td className="py-3 font-medium">
                          {getUserName(spending.userId)}
                        </td>
                        <td className="py-3">{spending.date}</td>
                        <td className="py-3">{spending.description}</td>
                        <td className="py-3">{spending.quantity}</td>
                        <td className="py-3">{spending.type}</td>
                        <td className="py-3">
                          {spending.billFilePath ? (
                            <button
                              onClick={() => void viewBill(spending.billFilePath!)}
                              className="font-semibold text-slate-900 underline"
                            >
                              View Bill
                            </button>
                          ) : (
                            <span className="text-slate-400">No Bill</span>
                          )}
                        </td>
                        <td className="py-3 text-right font-semibold">
                          {formatMoney(spending.amount)}
                        </td>

                      </tr>
                    ))}
                </tbody>
              </table>

              {selectedCategorySpendings.length === 0 && (
                <div className="py-10 text-center text-slate-500">
                  No transactions in this category.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (selectedDetailUser) {
    const userCategoryTotals = spendingTypes.map((category) => ({
      category,
      total: selectedUserSpendings
        .filter((spending) => spending.type === category)
        .reduce((sum, spending) => sum + spending.amount, 0),
    }));

    return (
      <div className="min-h-screen bg-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <button
            onClick={() => setSelectedDetailUserId(null)}
            className="text-sm font-semibold text-slate-700 mb-6"
          >
            ← Back to Month
          </button>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900">
              {selectedDetailUser.name}
            </h1>

            <p className="text-slate-500 mt-1">
              {selectedMonth.label} • {selectedDetailUser.id === currentUser.id ? "Your financial details" : "User details"}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <SummaryCard
              title="Total Budget"
              value={formatMoney(selectedUserBudgetTotal)}
            />

            <SummaryCard
              title="Total Spendings"
              value={formatMoney(selectedUserSpendingTotal)}
            />

            <SummaryCard
              title={
                selectedUserBalance < 0
                  ? "Amount Owed to User"
                  : "Balance"
              }
              value={formatMoney(
                selectedUserBalance < 0
                  ? Math.abs(selectedUserBalance)
                  : selectedUserBalance,
              )}
              negative={selectedUserBalance < 0}
            />
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
            <h2 className="text-xl font-bold text-slate-900 mb-5">
              Category Summary
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {userCategoryTotals.map((item) => (
                <div
                  key={item.category}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <p className="text-sm text-slate-500">
                    {item.category}
                  </p>

                  <p className="font-bold text-slate-900 mt-2">
                    {formatMoney(item.total)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-5">
              Spending
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-3">Date</th>
                    <th className="py-3">Description</th>
                    <th className="py-3">Quantity</th>
                    <th className="py-3">Type</th>
                    <th className="py-3">Bill</th>
                    <th className="py-3 text-right">Amount</th>
                    {selectedDetailUser.id === currentUser.id && (
                      <th className="py-3 text-right">Actions</th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {selectedUserSpendings
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((spending) => (
                      <tr
                        key={spending.id}
                        className="border-b last:border-0"
                      >
                        <td className="py-3">{spending.date}</td>
                        <td className="py-3">{spending.description}</td>
                        <td className="py-3">{spending.quantity}</td>
                        <td className="py-3">{spending.type}</td>
                        <td className="py-3">
                          {spending.billFilePath ? (
                            <button
                              onClick={() => void viewBill(spending.billFilePath!)}
                              className="font-semibold text-slate-900 underline"
                            >
                              View Bill
                            </button>
                          ) : (
                            <span className="text-slate-400">No Bill</span>
                          )}
                        </td>
                        <td className="py-3 text-right font-semibold">
                          {formatMoney(spending.amount)}
                        </td>

                        {selectedDetailUser.id === currentUser.id && (
                          <td className="py-3 text-right">
                            <div className="flex justify-end gap-3">
                              <button
                                onClick={() => openSpendingModal(spending)}
                                className="font-semibold text-slate-700"
                              >
                                Edit
                              </button>

                              <button
                                onClick={() => void deleteSpending(spending.id)}
                                className="font-semibold text-red-600"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>

              {selectedUserSpendings.length === 0 && (
                <div className="py-10 text-center text-slate-500">
                  No spending recorded for this month.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <button
          onClick={onBackHome}
          className="text-sm font-semibold text-slate-700 mb-6"
        >
          ← Back to Home
        </button>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900">
                {currentUser.name}
              </h1>

              <span className="px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-semibold">
                Admin
              </span>
            </div>

            <p className="text-slate-500 mt-1">
              Administrator Dashboard
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <button onClick={() => setShowPasswordModal(true)} className="bg-white border border-slate-300 rounded-xl px-4 py-3 font-semibold">Change Password</button>
            <select
            value={`${selectedMonth.year}-${selectedMonth.month}`}
            onChange={(event) => {
              const [year, month] = event.target.value
                .split("-")
                .map(Number);

              const found = monthOptions.find(
                (item) =>
                  item.year === year && item.month === month,
              );

              if (found) setSelectedMonth(found);
            }}
            className="bg-white border border-slate-300 rounded-xl px-4 py-3 font-medium outline-none"
          >
            {monthOptions.map((month) => (
              <option
                key={`${month.year}-${month.month}`}
                value={`${month.year}-${month.month}`}
              >
                {month.label}
              </option>
            ))}
          </select>
          </div>
        </div>

        {/* USER MANAGEMENT */}
        <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                User Management
              </h2>

              <p className="text-slate-500 mt-1">
                Manage users and administrator permissions.
              </p>
            </div>

            <button
              onClick={() => setShowUserModal(true)}
              className="px-5 py-3 rounded-xl bg-slate-900 text-white font-semibold"
            >
              + Add User
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[850px]">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-3">Name</th>
                  <th className="py-3">Role</th>
                  <th className="py-3">Status</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b last:border-0"
                  >
                    <td className="py-4 font-semibold text-slate-900">
                      {user.name}
                    </td>

                    <td className="py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            user.role === "admin"
                              ? "bg-slate-900 text-white"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {user.role === "admin" ? "Admin" : "Member"}
                        </span>

                        {user.active &&
                          getUserFinancials(user.id).debt > 0 && (
                            <span className="px-3 py-1 rounded-full bg-red-50 text-red-600 border border-red-200 text-xs font-semibold">
                              Owed{" "}
                              {formatMoney(
                                getUserFinancials(user.id).debt,
                              )}
                            </span>
                          )}
                      </div>
                    </td>

                    <td className="py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          user.active
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        {user.active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="py-4">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {user.active ? (
                          <>
                            <button
                              onClick={() =>
                                setSelectedDetailUserId(user.id)
                              }
                              className="px-3 py-2 rounded-lg border border-slate-300 font-medium"
                            >
                              View
                            </button>

                            {user.id !== currentUser.id && (
                              <>
                                <button
                                  onClick={() => toggleAdmin(user)}
                                  className="px-3 py-2 rounded-lg border border-slate-300 font-medium"
                                >
                                  {user.role === "admin"
                                    ? "Make Member"
                                    : "Make Admin"}
                                </button>

                                <button
                                  onClick={() =>
                                    void handleDeactivateUser(user)
                                  }
                                  className="px-3 py-2 rounded-lg border border-red-200 text-red-600 font-medium"
                                >
                                  Deactivate
                                </button>

                                <button
                                  onClick={() =>
                                    void handleDeleteUser(user)
                                  }
                                  className="px-3 py-2 rounded-lg border border-red-300 text-red-700 font-medium"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() =>
                                void handleReactivateUser(user)
                              }
                              className="px-3 py-2 rounded-lg border border-slate-300 font-medium"
                            >
                              Active
                            </button>

                            <button
                              onClick={() => void handleDeleteUser(user)}
                              className="px-3 py-2 rounded-lg border border-red-300 text-red-700 font-medium"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {users.length === 0 && (
              <p className="py-8 text-center text-slate-500">
                No users found.
              </p>
            )}
          </div>
        </div>

        

{/* BUDGET ALLOCATIONS */}
        <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Budget Allocations
              </h2>
              <p className="text-slate-500 mt-1">
                {selectedMonth.label} — your available budget and allocation history
              </p>
            </div>

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => openSpendingModal()}
                className="px-5 py-3 rounded-xl bg-slate-900 text-white font-semibold"
              >
                + Add Spending
              </button>
              <button
                onClick={() => {
                  setBudgetMode("own");
                  setShowBudgetModal(true);
                }}
                className="px-5 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold"
              >
                + Add Budget
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
            <SummaryCard title="My Available Budget" value={formatMoney(myBudget)} />
            <SummaryCard title="My Spending" value={formatMoney(mySpending)} />
            <SummaryCard
              title="My Remaining Balance"
              value={formatMoney(myBalance)}
              negative={myBalance < 0}
            />
          </div>

          {users.some((user) => getUserFinancials(user.id).debt > 0) && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="font-bold text-red-700">Outstanding debt</p>
              <div className="mt-2 space-y-1 text-sm text-red-700">
                {users
                  .filter((user) => getUserFinancials(user.id).debt > 0)
                  .map((user) => (
                    <p key={user.id}>
                      <span className="font-semibold">{user.name}</span>{" "}
                      is owed{" "}
                      <span className="font-bold">
                        {formatMoney(getUserFinancials(user.id).debt)}
                      </span>{" "}
                      because their spending exceeded their available budget.
                    </p>
                  ))}
              </div>
            </div>
          )}

          <div className="mt-8 mb-5">
            <h3 className="text-lg font-bold text-slate-900">Allocation History</h3>
            <p className="text-slate-500 mt-1">
              Budgets and money allocated for {selectedMonth.label}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-3">User</th>
                  <th className="py-3">Type</th>
                  <th className="py-3">Source</th>
                  <th className="py-3">Date</th>
                  <th className="py-3">Time</th>
                  <th className="py-3 text-right">Amount</th>
                  <th className="py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {monthBudgets.map((budget) => (
                  <tr key={budget.id} className="border-b last:border-0">
                    <td className="py-4 font-semibold">{getUserName(budget.userId)}</td>
                    <td className="py-4">
                      {budget.budgetType === "own" ? "Own Budget" : "User Allocation"}
                    </td>
                    <td className="py-4">
                      {budget.budgetType === "user_allocation"
                        ? `From ${getUserName(budget.allocatedBy ?? "")}`
                        : budget.source || "—"}
                    </td>
                    <td className="py-4">
                      {budget.allocatedAt
                        ? new Date(budget.allocatedAt).toLocaleDateString("en-PK")
                        : "—"}
                    </td>
                    <td className="py-4">
                      {budget.allocatedAt
                        ? new Date(budget.allocatedAt).toLocaleTimeString("en-PK", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="py-4 text-right font-semibold">
                      {formatMoney(budget.amount)}
                    </td>
                    <td className="py-4 text-right">
                      <button
                        onClick={() => deleteBudget(budget.id)}
                        className="text-red-600 font-semibold"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {monthBudgets.length === 0 && (
              <div className="py-10 text-center text-slate-500">
                No budgets recorded for this month.
              </div>
            )}
          </div>
        </div>

        {/* MONTHLY SUMMARY */}
        <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Monthly Summary</h2>
              <p className="text-slate-500 mt-1">Global figures for {selectedMonth.label}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={exportMonthlyReport}
                className="px-4 py-2 rounded-xl border border-slate-300 font-semibold hover:bg-slate-50"
              >
                Export CSV
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl border border-slate-300 font-semibold hover:bg-slate-50"
              >
                Print Report
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
            <SummaryCard
              title="Total Budget"
              value={formatMoney(totalBudget)}
            />
            <SummaryCard
              title="Total Spendings"
              value={formatMoney(totalSpendings)}
            />
            <SummaryCard
              title="Balance"
              value={formatMoney(globalBalance)}
              negative={globalBalance < 0}
            />
            <SummaryCard
              title="Users Owed"
              value={formatMoney(
                users.reduce(
                  (sum, user) => sum + getUserFinancials(user.id).debt,
                  0,
                ),
              )}
            />
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-bold text-slate-900">
              Spending by Category
            </h3>
            <p className="text-slate-500 mt-1 mb-4">
              Personal spending is intentionally excluded from this global summary.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {globalCategories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className="text-left rounded-xl border border-slate-200 p-4 hover:border-slate-400 transition"
                >
                  <p className="text-sm text-slate-500">{category}</p>
                  <p className="text-lg font-bold text-slate-900 mt-2">
                    {formatMoney(categoryTotal(category))}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    View transactions →
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

      

{/* SPENDING FILTERS */}
        <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
            <div><h2 className="text-xl font-bold text-slate-900">Spending Filters</h2><p className="text-slate-500 mt-1">Filter spending across users, types, months and dates.</p></div>
            <p className="font-bold text-slate-900">Filtered Total: {formatMoney(filteredTotal)}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <select value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)} className="border border-slate-300 rounded-xl px-4 py-3"><option value="all">All Users</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}{!u.active ? " (Inactive)" : ""}</option>)}</select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as SpendingType | "all")} className="border border-slate-300 rounded-xl px-4 py-3"><option value="all">All Types</option>{spendingTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="border border-slate-300 rounded-xl px-4 py-3">
              <option value="selected">Selected Month ({selectedMonth.label})</option>
              <option value="all">All Months</option>
              {monthOptions.map((month) => (
                <option key={`filter-${month.year}-${month.month}`} value={`${month.year}-${month.month}`}>{month.label}</option>
              ))}
            </select>
            <input type="date" value={filterFromDate} onChange={(e) => setFilterFromDate(e.target.value)} className="border border-slate-300 rounded-xl px-4 py-3" />
            <input type="date" value={filterToDate} onChange={(e) => setFilterToDate(e.target.value)} className="border border-slate-300 rounded-xl px-4 py-3" />
          </div>
          <div className="overflow-x-auto mt-6">
            <table className="w-full text-sm min-w-[900px]">
              <thead><tr className="border-b text-left text-slate-500"><th className="py-3">User</th><th className="py-3">Date</th><th className="py-3">Description</th><th className="py-3">Quantity</th><th className="py-3">Type</th><th className="py-3">Bill</th><th className="py-3 text-right">Amount</th></tr></thead>
              <tbody>{filteredSpendings.map((spending) => <tr key={spending.id} className="border-b last:border-0"><td className="py-3 font-semibold">{getUserName(spending.userId)}</td><td className="py-3">{spending.date}</td><td className="py-3">{spending.description}</td><td className="py-3">{spending.quantity}</td><td className="py-3">{spending.type}</td><td className="py-3">{spending.billFilePath ? <button onClick={() => void viewBill(spending.billFilePath!)} className="underline font-semibold">View Bill</button> : <span className="text-slate-400">No Bill</span>}</td><td className="py-3 text-right font-semibold">{formatMoney(spending.amount)}</td></tr>)}</tbody>
            </table>
            {filteredSpendings.length === 0 && <p className="py-8 text-center text-slate-500">No spending matches these filters.</p>}
          </div>
        </div>

        

      {/* BUDGET MODAL */}
      {showBudgetModal && (
        <Modal
          title={
            budgetMode === "own"
              ? "Add Budget to Myself"
              : "Allocate Budget to User"
          }
          onClose={closeBudgetModal}
        >
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Budget Type
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setBudgetMode("own")}
                  className={`p-3 rounded-xl border font-semibold ${
                    budgetMode === "own"
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700"
                  }`}
                >
                  Add to Myself
                </button>

                <button
                  onClick={() => setBudgetMode("user")}
                  className={`p-3 rounded-xl border font-semibold ${
                    budgetMode === "user"
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700"
                  }`}
                >
                  Allocate to User
                </button>
              </div>
            </div>

            {budgetMode === "user" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  User
                </label>

                <select
                  value={budgetUserId}
                  onChange={(event) =>
                    setBudgetUserId(event.target.value)
                  }
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                >
                  <option value="">Select user</option>

                  {users
                    .filter(
                      (user) =>
                        user.active && user.id !== currentUser.id,
                    )
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Amount
              </label>

              <input
                type="number"
                min="0"
                value={budgetAmount}
                onChange={(event) =>
                  setBudgetAmount(event.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
                placeholder="Enter amount"
              />
            </div>

            {budgetMode === "own" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Source
                </label>

                <input
                  type="text"
                  value={budgetSource}
                  onChange={(event) =>
                    setBudgetSource(event.target.value)
                  }
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  placeholder="e.g. Salary, Business, Cash"
                />
              </div>
            )}

            <button
              onClick={saveBudget}
              className="w-full bg-slate-900 text-white rounded-xl py-3 font-semibold"
            >
              Save Budget
            </button>
          </div>
        </Modal>
      )}

      {showPasswordModal && (
        <Modal title="Change Password" onClose={() => setShowPasswordModal(false)}>
          <div className="space-y-5">
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full border border-slate-300 rounded-xl px-4 py-3" placeholder="Minimum 6 characters" autoComplete="new-password" /></div>
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">Confirm New Password</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full border border-slate-300 rounded-xl px-4 py-3" placeholder="Repeat password" autoComplete="new-password" /></div>
            <button onClick={() => void savePassword()} className="w-full bg-slate-900 text-white rounded-xl py-3 font-semibold">Change Password</button>
          </div>
        </Modal>
      )}

      {/* ADD USER MODAL */}
      {showUserModal && (
        <Modal
          title="Add User"
          onClose={() => setShowUserModal(false)}
        >
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Name
              </label>

              <input
                type="text"
                value={newUserName}
                onChange={(event) =>
                  setNewUserName(event.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
                placeholder="Enter user name"
                autoComplete="name"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Email
              </label>

              <input
                type="email"
                value={newUserEmail}
                onChange={(event) =>
                  setNewUserEmail(event.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
                placeholder="Enter user email"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Password
              </label>

              <input
                type="password"
                value={newUserPassword}
                onChange={(event) =>
                  setNewUserPassword(event.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
                placeholder="Minimum 6 characters"
                autoComplete="new-password"
              />

              <p className="text-xs text-slate-400 mt-2">
                Set a temporary password for the user. They can use it to
                sign in immediately.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Role
              </label>

              <select
                value={newUserRole}
                onChange={(event) =>
                  setNewUserRole(event.target.value as UserRole)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <button
              onClick={() => void addUser()}
              className="w-full bg-slate-900 text-white rounded-xl py-3 font-semibold"
            >
              Add User
            </button>
          </div>
        </Modal>
      )}

      {/* ADMIN'S OWN SPENDING MODAL */}
      {showSpendingModal && (
        <Modal
          title={
            editingSpendingId !== null
              ? "Edit Spending"
              : "Add Spending"
          }
          onClose={closeSpendingModal}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Date
              </label>

              <input
                type="date"
                value={spendingDate}
                onChange={(event) =>
                  setSpendingDate(event.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Description
              </label>

              <input
                type="text"
                value={spendingDescription}
                onChange={(event) =>
                  setSpendingDescription(event.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
                placeholder="What did you spend on?"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Quantity
              </label>

              <input
                type="text"
                value={spendingQuantity}
                onChange={(event) =>
                  setSpendingQuantity(event.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
                placeholder="e.g. 5 kg, 20 liters, 2 bags"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Type
              </label>

              <select
                value={spendingType}
                onChange={(event) =>
                  setSpendingType(
                    event.target.value as SpendingType,
                  )
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              >
                {spendingTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Bill / Receipt (Optional)
              </label>

              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleBillFileChange}
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm"
              />

              {billFile && (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="truncate text-slate-700">
                    {billFile.name}
                  </span>

                  <button
                    type="button"
                    onClick={() => setBillFile(null)}
                    className="ml-3 font-semibold text-red-600"
                  >
                    Remove
                  </button>
                </div>
              )}

              <p className="text-xs text-slate-400 mt-2">
                Optional. Image or PDF, maximum 5 MB.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Amount
              </label>

              <input
                type="number"
                min="0"
                value={spendingAmount}
                onChange={(event) =>
                  setSpendingAmount(event.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
                placeholder="Enter amount"
              />
            </div>

            <button
              onClick={saveSpending}
              className="w-full bg-slate-900 text-white rounded-xl py-3 font-semibold"
            >
              {editingSpendingId !== null
                ? "Update Spending"
                : "Save Spending"}
            </button>
          </div>
        </Modal>
      )}
    </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  negative = false,
}: {
  title: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{title}</p>

      <p
        className={`text-2xl font-bold mt-2 ${
          negative ? "text-red-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-slate-900">
            {title}
          </h2>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default Admin;