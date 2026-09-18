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
    alert(`Could not open bill: ${error?.message ?? "File URL was not created."}`);
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
  const monthOptions = useMemo(() => getMonthOptions(12), []);

  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]);

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

  const balance = totalBudget - totalSpendings;
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
      const oldSpending = spendings.find((spending) => spending.id === editingId);
      let uploadedPath: string | null = null;

      if (billFile) {
        uploadedPath = `${user.id}/${crypto.randomUUID()}-${getSafeFileName(billFile.name)}`;
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
        spending_date: date,
        description: description.trim(),
        quantity: quantity.trim(),
        type: type,
        amount: numericAmount,
      };

      if (uploadedPath) {
        updatePayload.bill_file_path = uploadedPath;
        updatePayload.bill_file_name = billFile?.name ?? null;
        updatePayload.bill_file_type = billFile?.type ?? null;
      }

      const { data, error } = await supabase
        .from("spendings")
        .update(updatePayload)
        .eq("id", editingId)
        .eq("user_id", user.id)
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
          spending.id === editingId ? updatedSpending : spending,
        ),
      );
    } else {
      const { data, error } = await supabase
        .from("spendings")
        .insert({
          user_id: user.id,
          spending_date: date,
          description: description.trim(),
          quantity: quantity.trim(),
          type: type,
          amount: numericAmount,
        })
        .select("id, user_id, spending_date, description, quantity, type, amount, bill_file_path, bill_file_name, bill_file_type, created_at")
        .single();

      if (error) {
        alert(`Could not save spending: ${error.message}`);
        return;
      }

      let billFilePath: string | null = null;

      if (billFile) {
        billFilePath = `${user.id}/${data.id}-${crypto.randomUUID()}-${getSafeFileName(billFile.name)}`;

        const { error: uploadError } = await supabase.storage
          .from("bills")
          .upload(billFilePath, billFile, {
            contentType: billFile.type,
            upsert: false,
          });

        if (uploadError) {
          await supabase.from("spendings").delete().eq("id", data.id).eq("user_id", user.id);
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
          .eq("user_id", user.id)
          .select("id, user_id, spending_date, description, quantity, type, amount, bill_file_path, bill_file_name, bill_file_type, created_at")
          .single();

        if (fileUpdateError) {
          await supabase.storage.from("bills").remove([billFilePath]);
          await supabase.from("spendings").delete().eq("id", data.id).eq("user_id", user.id);
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

    closeModal();
  };

  const deleteSpending = async (id: number) => {
    if (!confirm("Delete this spending?")) return;

    const { error } = await supabase
      .from("spendings")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      alert(`Could not delete spending: ${error.message}`);
      return;
    }

    onSpendingsChange((current) =>
      current.filter((spending) => spending.id !== id),
    );
  };

  /*
   * Calculate remaining chronologically.
   * We calculate from oldest → newest,
   * then display newest → oldest.
   */
  const chronologicalSpendings = [...monthSpendings].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const remainingById = new Map<number, number>();

  let runningSpent = 0;

  chronologicalSpendings.forEach((spending) => {
    runningSpent += spending.amount;
    remainingById.set(spending.id, totalBudget - runningSpent);
  });

  const displayedSpendings = [...monthSpendings].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        <button
          onClick={onBackHome}
          className="mb-5 inline-flex min-h-10 items-center rounded-lg px-1 text-sm font-semibold text-slate-700 transition hover:text-blue-700"
        >
          ← Back to Home
        </button>

        <div className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {user.name}
            </h1>

            <p className="mt-1 text-sm text-slate-500 sm:text-base">
              Personal Expense Dashboard
            </p>
          </div>

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
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-auto"
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

        <div className="mb-6 grid grid-cols-1 gap-3 sm:mb-8 sm:grid-cols-3 sm:gap-4">
          <SummaryCard
            title="Total Budget Allocated"
            value={formatMoney(totalBudget)}
          />

          <SummaryCard
            title="Total Spendings"
            value={formatMoney(totalSpendings)}
          />

          <SummaryCard
            title={balance < 0 ? "Amount Owed to You" : "Balance"}
            value={formatMoney(
              balance < 0 ? Math.abs(balance) : balance,
            )}
            negative={balance < 0}
          />
        </div>

        {amountOwedToUser > 0 && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 sm:mb-8">
            <p className="font-bold text-red-700">
              You are owed {formatMoney(amountOwedToUser)}
            </p>
            <p className="mt-1 text-sm leading-5 text-red-600">
              Your spending has exceeded the budget allocated to you.
              This amount is currently unpaid.
            </p>
          </div>
        )}

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:mb-8 sm:p-6">
          <h2 className="mb-4 text-lg font-bold text-slate-900 sm:mb-5 sm:text-xl">
            Spending Summary
          </h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {categoryTotals.map((item) => (
              <div
                key={item.category}
                className="rounded-xl border border-slate-200 bg-slate-50/40 p-3 transition sm:p-4"
              >
                <p className="text-xs font-medium text-slate-500 sm:text-sm">
                  {item.category}
                </p>

                <p className="mt-1 text-base font-bold text-slate-900 sm:mt-2 sm:text-lg">
                  {formatMoney(item.total)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:mb-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                {selectedMonth.label} Spendings
              </h2>

              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Your spending records
              </p>
            </div>

            <button
              onClick={openAddModal}
              className="w-full rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:w-auto"
            >
              + Add Spending
            </button>
          </div>

          <div className="-mx-4 overflow-x-auto px-4 sm:-mx-0 sm:px-0">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-500">
                  <th className="py-3">Date</th>
                  <th className="py-3">Description</th>
                  <th className="py-3">Quantity</th>
                  <th className="py-3">Type</th>
                  <th className="py-3">Bill</th>
                  <th className="py-3 text-right">Amount</th>
                  <th className="py-3 text-right">Remaining</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {displayedSpendings.map((spending) => {
                  const remaining =
                    remainingById.get(spending.id) ?? totalBudget;

                  return (
                    <tr
                      key={spending.id}
                      className="border-b last:border-0"
                    >
                      <td className="py-4">{spending.date}</td>

                      <td className="py-4 font-medium">
                        {spending.description}
                      </td>

                      <td className="py-4">
                        {spending.quantity}
                      </td>

                      <td className="py-4">{spending.type}</td>

                      <td className="py-4">
                        {spending.billFilePath ? (
                          <button
                            onClick={() => void viewBill(spending.billFilePath!)}
                            className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800"
                          >
                            View Bill
                          </button>
                        ) : (
                          <span className="text-slate-400">No Bill</span>
                        )}
                      </td>

                      <td className="py-4 text-right font-semibold text-slate-900">
                        {formatMoney(spending.amount)}
                      </td>

                      <td
                        className={`py-4 text-right font-bold ${
                          remaining < 0 ? "text-red-600" : ""
                        }`}
                      >
                        {formatMoney(remaining)}
                      </td>

                      <td className="py-4">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => openEditModal(spending)}
                            className="font-semibold text-blue-700 transition hover:text-blue-800"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() =>
                              deleteSpending(spending.id)
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

            {displayedSpendings.length === 0 && (
              <div className="py-12 text-center text-slate-500">
                No spending recorded for this month.
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 sm:p-4">
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4 sm:p-6">
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                {editingId !== null
                  ? "Edit Spending"
                  : "Add Spending"}
              </h2>

              <button
                onClick={closeModal}
                className="rounded-lg px-2 py-1 text-2xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Date
                </label>

                <input
                  type="date"
                  value={date}
                  onChange={(event) =>
                    setDate(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Description
                </label>

                <input
                  type="text"
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="What did you spend on?"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Quantity
                </label>

                <input
                  type="text"
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="e.g. 5 kg, 20 liters, 2 bags"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Type
                </label>

                <select
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as SpendingType)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {spendingTypes.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Bill / Receipt (Optional)
                </label>

                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleBillFileChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Amount
                </label>

                <input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(event) =>
                    setAmount(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Enter amount"
                />
              </div>

              <button
                onClick={saveSpending}
                className="w-full rounded-xl bg-blue-700 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {editingId !== null
                  ? "Update Spending"
                  : "Save Spending"}
              </button>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <p className="text-xs font-medium text-slate-500 sm:text-sm">{title}</p>

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

export default Member;
