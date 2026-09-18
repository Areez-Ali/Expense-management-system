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
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <button
          onClick={onBackHome}
          className="text-sm font-semibold text-slate-700 mb-6"
        >
          ← Back to Home
        </button>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              {user.name}
            </h1>

            <p className="text-slate-500 mt-1">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
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
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="font-bold text-red-700">
              You are owed {formatMoney(amountOwedToUser)}
            </p>
            <p className="text-sm text-red-600 mt-1">
              Your spending has exceeded the budget allocated to you.
              This amount is currently unpaid.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-5">
            Spending Summary
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {categoryTotals.map((item) => (
              <div
                key={item.category}
                className="rounded-xl border border-slate-200 p-4"
              >
                <p className="text-sm text-slate-500">
                  {item.category}
                </p>

                <p className="text-lg font-bold text-slate-900 mt-2">
                  {formatMoney(item.total)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {selectedMonth.label} Spendings
              </h2>

              <p className="text-slate-500 mt-1">
                Your spending records
              </p>
            </div>

            <button
              onClick={openAddModal}
              className="px-5 py-3 rounded-xl bg-slate-900 text-white font-semibold"
            >
              + Add Spending
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
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
                            className="font-semibold text-slate-900 underline"
                          >
                            View Bill
                          </button>
                        ) : (
                          <span className="text-slate-400">No Bill</span>
                        )}
                      </td>

                      <td className="py-4 text-right font-semibold">
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
                            className="font-semibold text-slate-700"
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-slate-900">
                {editingId !== null
                  ? "Edit Spending"
                  : "Add Spending"}
              </h2>

              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Date
                </label>

                <input
                  type="date"
                  value={date}
                  onChange={(event) =>
                    setDate(event.target.value)
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
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
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
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(event.target.value)
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
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as SpendingType)
                  }
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                >
                  {spendingTypes.map((item) => (
                    <option key={item} value={item}>
                      {item}
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
                  value={amount}
                  onChange={(event) =>
                    setAmount(event.target.value)
                  }
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  placeholder="Enter amount"
                />
              </div>

              <button
                onClick={saveSpending}
                className="w-full bg-slate-900 text-white rounded-xl py-3 font-semibold"
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
    <div className="bg-white rounded-2xl p-6 shadow-sm">
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

export default Member;
