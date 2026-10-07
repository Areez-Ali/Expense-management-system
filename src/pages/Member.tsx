import {
  useMemo,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  Budget,
  Spending,
  SpendingType,
  User,
} from "../App";
import { supabase } from "../lib/supabase";

async function viewBill(path: string) {
  const { data, error } = await supabase.storage
    .from("bills")
    .createSignedUrl(path, 60);

  if (error || !data?.signedUrl) {
    alert(
      `Could not open bill: ${
        error?.message ?? "File URL was not created."
      }`,
    );
    return;
  }

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function getSafeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

type Props = {
  user: User;
  budgets: Budget[];
  spendings: Spending[];
  onBackHome: () => void;
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

type MonthOption = {
  month: number;
  year: number;
  label: string;
};

function getMonthOptions(
  budgets: Budget[],
  spendings: Spending[],
): MonthOption[] {
  const now = new Date();

  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  );

  const dataDates = [
    ...budgets.map(
      (budget) => new Date(budget.year, budget.month - 1, 1),
    ),

    ...spendings.map((spending) => {
      const date = new Date(`${spending.date}T00:00:00`);

      return new Date(
        date.getFullYear(),
        date.getMonth(),
        1,
      );
    }),
  ];

  // Always keep at least the previous 12 months available.
  dataDates.push(
    new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() - 12,
      1,
    ),
  );

  // Always keep the next 12 months available.
  dataDates.push(
    new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() + 11,
      1,
    ),
  );

  const earliestDate = new Date(
    Math.min(...dataDates.map((date) => date.getTime())),
  );

  const latestDate = new Date(
    Math.max(...dataDates.map((date) => date.getTime())),
  );

  const options: MonthOption[] = [];

  const cursor = new Date(
    earliestDate.getFullYear(),
    earliestDate.getMonth(),
    1,
  );

  while (cursor <= latestDate) {
    options.push({
      month: cursor.getMonth() + 1,
      year: cursor.getFullYear(),
      label: cursor.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return options;
}

function getInitialDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMoney(value: number) {
  return `Rs. ${value.toLocaleString("en-PK")}`;
}

function Member({
  user,
  budgets,
  spendings,
  onBackHome,
  onSpendingsChange,
}: Props) {
  const monthOptions = useMemo(
    () => getMonthOptions(budgets, spendings),
    [budgets, spendings],
  );

  const currentMonth = new Date();

  const defaultMonth =
    monthOptions.find(
      (option) =>
        option.month === currentMonth.getMonth() + 1 &&
        option.year === currentMonth.getFullYear(),
    ) ?? monthOptions[monthOptions.length - 1];

  const [selectedMonth, setSelectedMonth] =
    useState<MonthOption>(defaultMonth);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [date, setDate] = useState(getInitialDate());
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [type, setType] = useState<SpendingType>("Others");
  const [amount, setAmount] = useState("");
  const [billFile, setBillFile] = useState<File | null>(null);

  const monthBudgets = budgets.filter(
    (budget) =>
      budget.userId === user.id &&
      budget.month === selectedMonth.month &&
      budget.year === selectedMonth.year,
  );

  const monthSpendings = spendings.filter((spending) => {
    const spendingDate = new Date(`${spending.date}T00:00:00`);

    return (
      spending.userId === user.id &&
      spendingDate.getMonth() + 1 === selectedMonth.month &&
      spendingDate.getFullYear() === selectedMonth.year
    );
  });

  const totalBudget = monthBudgets.reduce(
    (sum, budget) => sum + budget.amount,
    0,
  );

  const totalSpendings = monthSpendings.reduce(
    (sum, spending) => sum + spending.amount,
    0,
  );

  /*
   * Calculate the cumulative balance through the selected month.
   *
   * Example:
   * September:
   * Budget = 10,000
   * Spending = 7,000
   * Remaining = 3,000
   *
   * October:
   * New Budget = 5,000
   * Spending = 2,000
   *
   * October Balance = 3,000 + 5,000 - 2,000
   *                  = 6,000
   */
  const selectedMonthEnd = new Date(
    selectedMonth.year,
    selectedMonth.month,
    0,
  );

  const cumulativeBudget = budgets
    .filter((budget) => {
      if (budget.userId !== user.id) {
        return false;
      }

      const budgetDate = new Date(
        budget.year,
        budget.month - 1,
        1,
      );

      return budgetDate <= selectedMonthEnd;
    })
    .reduce((sum, budget) => sum + budget.amount, 0);

  const cumulativeSpendings = spendings
    .filter((spending) => {
      if (spending.userId !== user.id) {
        return false;
      }

      const spendingDate = new Date(
        `${spending.date}T00:00:00`,
      );

      return spendingDate <= selectedMonthEnd;
    })
    .reduce((sum, spending) => sum + spending.amount, 0);

  const balance = cumulativeBudget - cumulativeSpendings;

  const amountOwedToUser = Math.max(0, -balance);

  const categoryTotals = spendingTypes.map((category) => ({
    category,
    total: monthSpendings
      .filter((spending) => spending.type === category)
      .reduce((sum, spending) => sum + spending.amount, 0),
  }));

  const openAddModal = () => {
    setEditingId(null);
    setDate(getInitialDate());
    setDescription("");
    setQuantity("");
    setType("Others");
    setAmount("");
    setBillFile(null);
    setShowModal(true);
  };

  const openEditModal = (spending: Spending) => {
    setEditingId(spending.id);
    setDate(spending.date);
    setDescription(spending.description);
    setQuantity(spending.quantity);
    setType(spending.type);
    setAmount(String(spending.amount));
    setBillFile(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
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

    if (
      !file.type.startsWith("image/") &&
      file.type !== "application/pdf"
    ) {
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
    const numericAmount = Number(amount);

    if (!date) {
      alert("Please select a date.");
      return;
    }

    if (!description.trim()) {
      alert("Please enter a description.");
      return;
    }

    if (!quantity.trim()) {
      alert("Please enter quantity.");
      return;
    }

    if (!numericAmount || numericAmount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    if (editingId !== null) {
      const existingSpending = spendings.find(
        (spending) => spending.id === editingId,
      );

      const { data, error } = await supabase
        .from("spendings")
        .update({
          spending_date: date,
          description: description.trim(),
          quantity: quantity.trim(),
          type,
          amount: numericAmount,
        })
        .eq("id", editingId)
        .eq("user_id", user.id)
        .select(
          "id, user_id, house_id, spending_date, description, quantity, type, amount, bill_file_path, bill_file_name, bill_file_type, created_at",
        )
        .single();

      if (error) {
        alert(`Could not update spending: ${error.message}`);
        return;
      }

      let updatedData = data;

      if (billFile) {
        const safeName = getSafeFileName(billFile.name);
        const filePath = `spendings/${user.id}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("bills")
          .upload(filePath, billFile, {
            contentType: billFile.type,
            upsert: false,
          });

        if (uploadError) {
          alert(`Could not upload bill: ${uploadError.message}`);
          return;
        }

        const { data: fileData, error: fileUpdateError } =
          await supabase
            .from("spendings")
            .update({
              bill_file_path: filePath,
              bill_file_name: billFile.name,
              bill_file_type: billFile.type,
            })
            .eq("id", editingId)
            .eq("user_id", user.id)
            .select(
              "id, user_id, house_id, spending_date, description, quantity, type, amount, bill_file_path, bill_file_name, bill_file_type, created_at",
            )
            .single();

        if (fileUpdateError) {
          await supabase.storage
            .from("bills")
            .remove([filePath]);

          alert(
            `Could not save bill information: ${fileUpdateError.message}`,
          );
          return;
        }

        updatedData = fileData;

        if (
          existingSpending?.billFilePath &&
          existingSpending.billFilePath !== filePath
        ) {
          await supabase.storage
            .from("bills")
            .remove([existingSpending.billFilePath]);
        }
      }

      const updatedSpending: Spending = {
        id: updatedData.id,
        userId: updatedData.user_id,
        houseId: updatedData.house_id ?? user.houseId,
        date: updatedData.spending_date,
        description: updatedData.description,
        quantity: updatedData.quantity,
        type: updatedData.type,
        amount: Number(updatedData.amount),
        billFilePath:
          updatedData.bill_file_path ?? undefined,
        billFileName:
          updatedData.bill_file_name ?? undefined,
        billFileType:
          updatedData.bill_file_type ?? undefined,
      };

      onSpendingsChange((current) =>
        current.map((item) =>
          item.id === updatedSpending.id
            ? updatedSpending
            : item,
        ),
      );
    } else {
      const { data, error } = await supabase
        .from("spendings")
        .insert({
          user_id: user.id,
          house_id: user.houseId,
          spending_date: date,
          description: description.trim(),
          quantity: quantity.trim(),
          type,
          amount: numericAmount,
        })
        .select(
          "id, user_id, house_id, spending_date, description, quantity, type, amount, bill_file_path, bill_file_name, bill_file_type, created_at",
        )
        .single();

      if (error) {
        alert(`Could not save spending: ${error.message}`);
        return;
      }

      let updatedData = data;

      if (billFile) {
        const safeName = getSafeFileName(billFile.name);
        const billFilePath = `spendings/${user.id}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("bills")
          .upload(billFilePath, billFile, {
            contentType: billFile.type,
            upsert: false,
          });

        if (uploadError) {
          await supabase
            .from("spendings")
            .delete()
            .eq("id", data.id)
            .eq("user_id", user.id);

          alert(`Could not upload bill: ${uploadError.message}`);
          return;
        }

        const { data: fileData, error: fileUpdateError } =
          await supabase
            .from("spendings")
            .update({
              bill_file_path: billFilePath,
              bill_file_name: billFile.name,
              bill_file_type: billFile.type,
            })
            .eq("id", data.id)
            .eq("user_id", user.id)
            .select(
              "id, user_id, house_id, spending_date, description, quantity, type, amount, bill_file_path, bill_file_name, bill_file_type, created_at",
            )
            .single();

        if (fileUpdateError) {
          await supabase.storage
            .from("bills")
            .remove([billFilePath]);

          await supabase
            .from("spendings")
            .delete()
            .eq("id", data.id)
            .eq("user_id", user.id);

          alert(
            `Could not save bill information: ${fileUpdateError.message}`,
          );
          return;
        }

        updatedData = fileData;
      }

      const newSpending: Spending = {
        id: updatedData.id,
        userId: updatedData.user_id,
        houseId: updatedData.house_id,
        date: updatedData.spending_date,
        description: updatedData.description,
        quantity: updatedData.quantity,
        type: updatedData.type,
        amount: Number(updatedData.amount),
        billFilePath:
          updatedData.bill_file_path ?? undefined,
        billFileName:
          updatedData.bill_file_name ?? undefined,
        billFileType:
          updatedData.bill_file_type ?? undefined,
      };

      onSpendingsChange((current) => [
        ...current,
        newSpending,
      ]);
    }

    closeModal();
  };

  const deleteSpending = async (id: number) => {
    if (!confirm("Delete this spending?")) return;

    const spending = spendings.find(
      (item) => item.id === id,
    );

    const { error } = await supabase
      .from("spendings")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      alert(`Could not delete spending: ${error.message}`);
      return;
    }

    if (spending?.billFilePath) {
      await supabase.storage
        .from("bills")
        .remove([spending.billFilePath]);
    }

    onSpendingsChange((current) =>
      current.filter((item) => item.id !== id),
    );
  };

  /*
   * Calculate remaining chronologically.
   *
   * The starting balance for the selected month includes
   * everything carried forward from previous months.
   */
  const selectedMonthStart = new Date(
    selectedMonth.year,
    selectedMonth.month - 1,
    1,
  );

  const previousBudget = budgets
    .filter((budget) => {
      if (budget.userId !== user.id) {
        return false;
      }

      const budgetDate = new Date(
        budget.year,
        budget.month - 1,
        1,
      );

      return budgetDate < selectedMonthStart;
    })
    .reduce((sum, budget) => sum + budget.amount, 0);

  const previousSpendings = spendings
    .filter((spending) => {
      if (spending.userId !== user.id) {
        return false;
      }

      const spendingDate = new Date(
        `${spending.date}T00:00:00`,
      );

      return spendingDate < selectedMonthStart;
    })
    .reduce((sum, spending) => sum + spending.amount, 0);

  const carriedForwardBalance =
    previousBudget - previousSpendings;

  const chronologicalSpendings = [...monthSpendings].sort(
    (a, b) => a.date.localeCompare(b.date),
  );

  const remainingById = new Map<number, number>();

  let runningSpent = 0;

  chronologicalSpendings.forEach((spending) => {
    runningSpent += spending.amount;

    remainingById.set(
      spending.id,
      carriedForwardBalance +
        totalBudget -
        runningSpent,
    );
  });

  const displayedSpendings = [...monthSpendings].sort(
    (a, b) => b.date.localeCompare(a.date),
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        {/* HEADER */}
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Member Dashboard
            </p>
            <p className="text-sm font-medium text-blue-700">
              {user.houseName ?? "Your household"}
            </p>

            <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
              Welcome, {user.name}
            </h1>
          </div>

          <button
            onClick={onBackHome}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
          >
            ← Back to Home
          </button>
        </div>

        {/* MONTH SELECTOR */}
        <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm sm:mb-8 sm:p-6">
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Select Month
          </label>

          <select
            value={`${selectedMonth.month}-${selectedMonth.year}`}
            onChange={(event) => {
              const [month, year] = event.target.value
                .split("-")
                .map(Number);

              const selected = monthOptions.find(
                (item) =>
                  item.month === month &&
                  item.year === year,
              );

              if (selected) {
                setSelectedMonth(selected);
              }
            }}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:max-w-xs"
          >
            {monthOptions.map((month) => (
              <option
                key={`${month.month}-${month.year}`}
                value={`${month.month}-${month.year}`}
              >
                {month.label}
              </option>
            ))}
          </select>
        </div>

        {/* SUMMARY */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:mb-8 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard
            title="Total Budget"
            value={formatMoney(totalBudget)}
          />

          <SummaryCard
            title="Total Spendings"
            value={formatMoney(totalSpendings)}
          />

          <SummaryCard
            title={
              balance < 0
                ? "Amount Owed to You"
                : "Remaining Balance"
            }
            value={formatMoney(
              balance < 0 ? amountOwedToUser : balance,
            )}
            negative={balance < 0}
          />
        </div>

        {balance < 0 && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 sm:mb-8">
            You are owed {formatMoney(amountOwedToUser)} because
            your spending is higher than your allocated budget.
          </div>
        )}

        {/* CATEGORY SUMMARY */}
        <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm sm:mb-8 sm:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
              Spending by Category
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {selectedMonth.label}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categoryTotals.map((item) => (
              <div
                key={item.category}
                className="rounded-xl border border-slate-200 p-3 sm:p-4"
              >
                <p className="break-words text-xs font-medium text-slate-500 sm:text-sm">
                  {item.category}
                </p>

                <p className="mt-2 break-words text-sm font-bold text-slate-900 sm:text-base">
                  {formatMoney(item.total)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* SPENDING */}
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                Spending
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {selectedMonth.label}
              </p>
            </div>

            <button
              onClick={openAddModal}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:w-auto"
            >
              + Add Spending
            </button>
          </div>

          {/* DESKTOP TABLE */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-500">
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Description</th>
                  <th className="py-3 pr-4">Quantity</th>
                  <th className="py-3 pr-4">Type</th>
                  <th className="py-3 pr-4">Bill</th>
                  <th className="py-3 pr-4 text-right">
                    Amount
                  </th>
                  <th className="py-3 pr-4 text-right">
                    Remaining
                  </th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {displayedSpendings.map((spending) => {
                  const remaining =
                    remainingById.get(spending.id) ??
                    carriedForwardBalance +
                      totalBudget;

                  return (
                    <tr
                      key={spending.id}
                      className="border-b last:border-0"
                    >
                      <td className="py-4 pr-4 whitespace-nowrap">
                        {spending.date}
                      </td>

                      <td className="max-w-[220px] py-4 pr-4 font-medium">
                        <div className="break-words">
                          {spending.description}
                        </div>
                      </td>

                      <td className="py-4 pr-4">
                        {spending.quantity}
                      </td>

                      <td className="max-w-[150px] py-4 pr-4">
                        <div className="break-words">
                          {spending.type}
                        </div>
                      </td>

                      <td className="py-4 pr-4">
                        {spending.billFilePath ? (
                          <button
                            onClick={() =>
                              void viewBill(
                                spending.billFilePath!,
                              )
                            }
                            className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800"
                          >
                            View Bill
                          </button>
                        ) : (
                          <span className="text-slate-400">
                            No Bill
                          </span>
                        )}
                      </td>

                      <td className="py-4 pr-4 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {formatMoney(spending.amount)}
                      </td>

                      <td
                        className={`py-4 pr-4 text-right font-bold whitespace-nowrap ${
                          remaining < 0
                            ? "text-red-600"
                            : "text-slate-900"
                        }`}
                      >
                        {formatMoney(remaining)}
                      </td>

                      <td className="py-4">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() =>
                              openEditModal(spending)
                            }
                            className="font-semibold text-blue-700 transition hover:text-blue-800"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() =>
                              void deleteSpending(
                                spending.id,
                              )
                            }
                            className="font-semibold text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* MOBILE / TABLET CARDS */}
          <div className="space-y-3 lg:hidden">
            {displayedSpendings.map((spending) => {
              const remaining =
                remainingById.get(spending.id) ??
                carriedForwardBalance +
                  totalBudget;

              return (
                <div
                  key={spending.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">
                        {spending.date}
                      </p>

                      <h3 className="mt-1 break-words text-base font-bold text-slate-900">
                        {spending.description}
                      </h3>
                    </div>

                    <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                      {spending.type}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-slate-500">
                        Quantity
                      </p>

                      <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                        {spending.quantity}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Amount
                      </p>

                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {formatMoney(spending.amount)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Remaining
                      </p>

                      <p
                        className={`mt-1 text-sm font-bold ${
                          remaining < 0
                            ? "text-red-600"
                            : "text-slate-900"
                        }`}
                      >
                        {formatMoney(remaining)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Bill
                      </p>

                      <div className="mt-1">
                        {spending.billFilePath ? (
                          <button
                            onClick={() =>
                              void viewBill(
                                spending.billFilePath!,
                              )
                            }
                            className="text-sm font-semibold text-blue-700 underline underline-offset-2"
                          >
                            View Bill
                          </button>
                        ) : (
                          <span className="text-sm text-slate-400">
                            No Bill
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2 border-t border-slate-200 pt-3">
                    <button
                      onClick={() =>
                        openEditModal(spending)
                      }
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-slate-50"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() =>
                        void deleteSpending(spending.id)
                      }
                      className="flex-1 rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {displayedSpendings.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500">
              No spending recorded for this month.
            </div>
          )}
        </div>
      </div>

      {/* ADD / EDIT SPENDING MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
          <div className="max-h-[95vh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4 sm:p-6">
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                {editingId !== null
                  ? "Edit Spending"
                  : "Add Spending"}
              </h2>

              <button
                onClick={closeModal}
                className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Date
                </label>

                <input
                  type="date"
                  value={date}
                  onChange={(event) =>
                    setDate(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Description
                </label>

                <input
                  type="text"
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  placeholder="e.g. Grocery shopping"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Quantity
                </label>

                <input
                  type="text"
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(event.target.value)
                  }
                  placeholder="e.g. 5 kg"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Type
                </label>

                <select
                  value={type}
                  onChange={(event) =>
                    setType(
                      event.target.value as SpendingType,
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {spendingTypes.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Amount
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) =>
                    setAmount(event.target.value)
                  }
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Bill / Receipt
                </label>

                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleBillFileChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold"
                />

                <p className="mt-1.5 text-xs text-slate-500">
                  Optional. Image or PDF, maximum 5 MB.
                </p>

                {billFile && (
                  <p className="mt-2 break-all text-sm font-medium text-slate-700">
                    Selected: {billFile.name}
                  </p>
                )}
              </div>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  onClick={closeModal}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto"
                >
                  Cancel
                </button>

                <button
                  onClick={() => void saveSpending()}
                  className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto"
                >
                  {editingId !== null
                    ? "Save Changes"
                    : "Add Spending"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
    <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p
        className={`mt-2 break-words text-xl font-bold sm:text-2xl ${
          negative ? "text-red-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default Member;
