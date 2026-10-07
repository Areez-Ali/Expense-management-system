import { useEffect, useState, type FormEvent } from "react";
import type { HouseholdRole, User } from "../App";
import { supabase } from "../lib/supabase";

type Household = {
  id: string;
  name: string;
};

type HouseholdUser = Pick<User, "id" | "name" | "role" | "active" | "houseId">;

type Props = {
  currentUser: User;
  onLogout: () => void;
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return fallback;
}

async function functionErrorMessage(error: unknown, fallback: string) {
  const context =
    typeof error === "object" && error !== null && "context" in error
      ? error.context
      : undefined;
  if (context instanceof Response) {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
    } catch {
      // Fall through to the SDK error message.
    }
  }
  return errorMessage(error, fallback);
}

export default function SuperAdmin({ currentUser, onLogout }: Props) {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState("");
  const [householdUsers, setHouseholdUsers] = useState<HouseholdUser[]>([]);
  const [loadingHouseholds, setLoadingHouseholds] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [householdName, setHouseholdName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [creatingHousehold, setCreatingHousehold] = useState(false);
  const [showCreateHousehold, setShowCreateHousehold] = useState(false);
  const [showEditHouse, setShowEditHouse] = useState(false);
  const [houseNameDraft, setHouseNameDraft] = useState("");
  const [savingHouseName, setSavingHouseName] = useState(false);

  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<HouseholdRole>("member");
  const [creatingUser, setCreatingUser] = useState(false);

  const [householdToDelete, setHouseholdToDelete] = useState<Household | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingHousehold, setDeletingHousehold] = useState(false);

  const selectedHousehold = households.find(
    (household) => household.id === selectedHouseholdId,
  ) ?? null;

  const loadHouseholds = async () => {
    setLoadingHouseholds(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("households")
      .select("id, name")
      .order("name", { ascending: true });

    setLoadingHouseholds(false);
    if (queryError) {
      setError(`Could not load houses: ${queryError.message}`);
      return;
    }

    const rows = (data ?? []) as Household[];
    setHouseholds(rows);
    setSelectedHouseholdId((currentId) => {
      return rows.some((household) => household.id === currentId)
        ? currentId
        : "";
    });
  };

  const loadHouseholdUsers = async (householdId: string) => {
    if (!householdId) {
      setHouseholdUsers([]);
      return;
    }
    setLoadingUsers(true);
    const { data, error: queryError } = await supabase
      .from("profiles")
      .select("id, name, role, active, house_id")
      .eq("house_id", householdId)
      .order("created_at", { ascending: true });

    setLoadingUsers(false);
    if (queryError) {
      setHouseholdUsers([]);
      setError(`Could not load house users: ${queryError.message}`);
      return;
    }
    setHouseholdUsers(
      (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        active: row.active,
        houseId: row.house_id,
      })) as HouseholdUser[],
    );
  };

  useEffect(() => {
    void loadHouseholds();
  }, []);

  useEffect(() => {
    void loadHouseholdUsers(selectedHouseholdId);
  }, [selectedHouseholdId]);

  const handleCreateHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setCreatingHousehold(true);

    // Uses the existing create-household function contract; this does not sign
    // the Super Admin into the newly created household's Admin account.
    const { data, error: invokeError } = await supabase.functions.invoke(
      "create-household",
      {
        body: {
          householdName: householdName.trim(),
          name: adminName.trim(),
          email: adminEmail.trim().toLowerCase(),
          password: adminPassword,
        },
      },
    );

    const responseError =
      data?.error !== undefined && data.error !== null && data.error !== ""
        ? String(data.error)
        : null;
    const creationError = invokeError
      ? await functionErrorMessage(invokeError, "House could not be created.")
      : responseError;

    // A successful 2xx response is success even when the function's response
    // body does not include a user object.
    if (creationError) {
      setError(creationError);
      setCreatingHousehold(false);
      return;
    }

    setHouseholdName("");
    setAdminName("");
    setAdminEmail("");
    setAdminPassword("");
    setShowCreateHousehold(false);
    setNotice("House and first Admin created.");
    await loadHouseholds();
    setCreatingHousehold(false);
  };

  const handleUpdateHouseName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedHousehold) return;
    const name = houseNameDraft.trim();
    if (!name) {
      setError("House name is required.");
      return;
    }

    setError("");
    setNotice("");
    setSavingHouseName(true);
    const { data, error: updateError } = await supabase
      .from("households")
      .update({ name })
      .eq("id", selectedHousehold.id)
      .select("id, name")
      .single();

    if (updateError || !data) {
      setError(updateError?.message ?? "Could not update house name.");
      setSavingHouseName(false);
      return;
    }

    setHouseholds((items) =>
      items.map((item) => item.id === data.id ? { ...item, name: data.name } : item),
    );
    setSelectedHouseholdId(data.id);
    setShowEditHouse(false);
    setHouseNameDraft("");
    await loadHouseholds();
    setNotice("House name updated successfully.");
    setSavingHouseName(false);
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedHousehold) return;
    setError("");
    setNotice("");
    setCreatingUser(true);

    const { data, error: invokeError } = await supabase.functions.invoke(
      "create-user",
      {
        body: {
          name: newUserName.trim(),
          email: newUserEmail.trim().toLowerCase(),
          password: newUserPassword,
          role: newUserRole,
          houseId: selectedHousehold.id,
        },
      },
    );

    if (invokeError || !data?.user?.id) {
      setError(
        invokeError
          ? await functionErrorMessage(invokeError, "User could not be created.")
          : data?.error ?? "User could not be created.",
      );
      setCreatingUser(false);
      return;
    }

    setNewUserName("");
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserRole("member");
    setNotice("User created.");
    await loadHouseholdUsers(selectedHousehold.id);
    setCreatingUser(false);
  };

  const updateHouseholdUser = async (
    user: HouseholdUser,
    updates: { role?: HouseholdRole; active?: boolean },
  ) => {
    if (!selectedHousehold || user.id === currentUser.id) return;
    setBusyUserId(user.id);
    setError("");
    setNotice("");
    const { data, error: updateError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .eq("house_id", selectedHousehold.id)
      .select("id, name, role, active, house_id")
      .single();

    if (updateError || !data) {
      setError(`Could not update user: ${updateError?.message ?? "No profile returned."}`);
    } else {
      setHouseholdUsers((users) =>
        users.map((item) =>
          item.id === user.id
            ? {
                id: data.id,
                name: data.name,
                role: data.role,
                active: data.active,
                houseId: data.house_id,
              }
            : item,
        ),
      );
      setNotice("User updated.");
    }
    setBusyUserId(null);
  };

  const handleDeleteUser = async (user: HouseholdUser) => {
    if (user.id === currentUser.id) return;
    const confirmed = window.confirm(
      `Permanently delete ${user.name}? This action cannot be undone.`,
    );
    if (!confirmed) return;

    setBusyUserId(user.id);
    setError("");
    setNotice("");
    const { data, error: invokeError } = await supabase.functions.invoke(
      "delete-user",
      { body: { userId: user.id } },
    );

    if (invokeError || !data?.success) {
      setError(
        invokeError
          ? await functionErrorMessage(invokeError, "User could not be deleted.")
          : data?.error ?? "User could not be deleted.",
      );
    } else {
      setHouseholdUsers((users) => users.filter((item) => item.id !== user.id));
      setNotice("User permanently deleted.");
    }
    setBusyUserId(null);
  };

  const handleDeleteHousehold = async () => {
    if (
      !householdToDelete ||
      deleteConfirmation.trim() !== householdToDelete.name.trim()
    ) {
      return;
    }
    setDeletingHousehold(true);
    setError("");
    setNotice("");

    const { data, error: deleteError } = await supabase.functions.invoke(
      "delete-household",
      { body: { householdId: householdToDelete.id } },
    );

    if (deleteError || !data?.success) {
      setError(
        deleteError
          ? await functionErrorMessage(deleteError, "House could not be deleted.")
          : data?.error ?? "House could not be deleted.",
      );
      setDeletingHousehold(false);
      return;
    }

    const deletedName = householdToDelete.name;
    setHouseholdToDelete(null);
    setDeleteConfirmation("");
    setNotice(`${deletedName} deleted.`);
    await loadHouseholds();
    setDeletingHousehold(false);
  };

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Super Admin</h1>
            <p className="mt-1 text-slate-600">Global house and user management</p>
            <p className="mt-1 text-sm text-slate-500">Signed in as {currentUser.name}</p>
          </div>
          <button onClick={onLogout} className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800">
            Logout
          </button>
        </header>

        {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {notice && <div role="status" className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{notice}</div>}

        <div className="grid gap-6 lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.7fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Houses</h2>
                <p className="mt-1 text-sm text-slate-500">{households.length} total</p>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                onClick={() => setShowCreateHousehold(true)}
                className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                + Add House
              </button>
              <button
                onClick={() => void loadHouseholds()}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
            {loadingHouseholds ? (
              <p className="py-8 text-center text-slate-500">Loading houses…</p>
            ) : households.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No houses found.</p>
            ) : (
              <ul className="space-y-2">
                {households.map((household) => (
                  <li key={household.id}>
                    <button
                      onClick={() => setSelectedHouseholdId(household.id)}
                      aria-pressed={selectedHouseholdId === household.id}
                      className={`w-full rounded-xl border p-4 text-left transition ${selectedHouseholdId === household.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}
                    >
                      <span className="block font-semibold text-slate-900">{household.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{selectedHousehold?.name ?? "Select a house"}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedHousehold
                      ? "Manage Admins and Members for this house."
                      : "Choose a house from the list to view its users and management options."}
                  </p>
                </div>
                {selectedHousehold && (
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => { setHouseNameDraft(selectedHousehold.name); setShowEditHouse(true); setError(""); setNotice(""); }} className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                      Edit House
                    </button>
                    <button onClick={() => { setHouseholdToDelete(selectedHousehold); setDeleteConfirmation(""); }} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">
                      Delete House
                    </button>
                  </div>
                )}
              </div>

              {!selectedHousehold ? (
                <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700">⌂</div>
                  <p className="font-semibold text-slate-800">Select a house</p>
                  <p className="mt-1 max-w-sm text-sm text-slate-500">Choose a house from the list to view its users and management options.</p>
                </div>
              ) : loadingUsers ? (
                <p className="py-8 text-center text-slate-500">Loading users…</p>
              ) : householdUsers.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No profiles found in this house.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead><tr className="border-b text-left text-slate-500"><th className="py-3 pr-3">Name</th><th className="py-3 pr-3">Role</th><th className="py-3 pr-3">Status</th><th className="py-3 text-right">Actions</th></tr></thead>
                    <tbody>
                      {householdUsers.map((user) => (
                        <tr key={user.id} className="border-b last:border-0">
                          <td className="py-4 pr-3"><span className="font-semibold text-slate-900">{user.name}</span>{user.id === currentUser.id && <span className="ml-2 text-xs text-slate-500">(you)</span>}</td>
                          <td className="py-4 pr-3">
                            {user.id === currentUser.id ? <span className="capitalize">{user.role.replace("_", " ")}</span> : (
                              <select aria-label={`Role for ${user.name}`} value={user.role} disabled={busyUserId === user.id} onChange={(event) => void updateHouseholdUser(user, { role: event.target.value as HouseholdRole })} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">
                                <option value="admin">Admin</option><option value="member">Member</option>
                              </select>
                            )}
                          </td>
                          <td className="py-4 pr-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>{user.active ? "Active" : "Inactive"}</span></td>
                          <td className="py-4 text-right">
                            {user.id !== currentUser.id && <div className="flex justify-end gap-3 whitespace-nowrap">
                              <button disabled={busyUserId === user.id} onClick={() => void updateHouseholdUser(user, { active: !user.active })} className="font-semibold text-blue-700 disabled:opacity-50">{user.active ? "Deactivate" : "Activate"}</button>
                              <button disabled={busyUserId === user.id} onClick={() => void handleDeleteUser(user)} className="font-semibold text-red-600 disabled:opacity-50">Delete</button>
                            </div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedHousehold && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-xl font-bold text-slate-900">Add user to house</h2>
                <p className="mt-1 text-sm text-slate-500">Creates an Admin or Member in {selectedHousehold.name}.</p>
                <form onSubmit={(event) => void handleCreateUser(event)} className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-700">Name<input required value={newUserName} onChange={(event) => setNewUserName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" autoComplete="name" /></label>
                  <label className="text-sm font-semibold text-slate-700">Email<input required type="email" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" autoComplete="email" /></label>
                  <label className="text-sm font-semibold text-slate-700">Password<input required type="password" minLength={6} value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" autoComplete="new-password" /></label>
                  <label className="text-sm font-semibold text-slate-700">Role<select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as HouseholdRole)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"><option value="member">Member</option><option value="admin">Admin</option></select></label>
                  <button type="submit" disabled={creatingUser} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2">{creatingUser ? "Creating user…" : "Add User"}</button>
                </form>
              </div>
            )}
          </section>
        </div>
      </div>

      {showEditHouse && selectedHousehold && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-house-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <h2 id="edit-house-title" className="text-xl font-bold text-slate-900">Edit House</h2>
            <form onSubmit={(event) => void handleUpdateHouseName(event)} className="mt-5">
              <label className="block text-sm font-semibold text-slate-700">House Name<input required autoFocus value={houseNameDraft} onChange={(event) => setHouseNameDraft(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" /></label>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" disabled={savingHouseName} onClick={() => { setShowEditHouse(false); setHouseNameDraft(""); }} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={savingHouseName || !houseNameDraft.trim()} className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{savingHouseName ? "Saving…" : "Save Changes"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showCreateHousehold && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="create-household-title" className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="create-household-title" className="text-xl font-bold text-slate-900">Add House</h2>
                <p className="mt-1 text-sm text-slate-500">Create a house and its first Admin account.</p>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                disabled={creatingHousehold}
                onClick={() => {
                  setShowCreateHousehold(false);
                  setHouseholdName("");
                  setAdminName("");
                  setAdminEmail("");
                  setAdminPassword("");
                }}
                className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>
            <form onSubmit={(event) => void handleCreateHousehold(event)} className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">House Name<input required value={householdName} onChange={(event) => setHouseholdName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" autoComplete="organization" /></label>
              <label className="text-sm font-semibold text-slate-700">First Admin Name<input required value={adminName} onChange={(event) => setAdminName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" autoComplete="name" /></label>
              <label className="text-sm font-semibold text-slate-700">First Admin Email<input required type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" autoComplete="email" /></label>
              <label className="text-sm font-semibold text-slate-700">First Admin Password<input required type="password" minLength={6} value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" autoComplete="new-password" /></label>
              <div className="flex flex-col-reverse gap-3 pt-2 sm:col-span-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={creatingHousehold}
                  onClick={() => {
                    setShowCreateHousehold(false);
                    setHouseholdName("");
                    setAdminName("");
                    setAdminEmail("");
                    setAdminPassword("");
                  }}
                  className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button type="submit" disabled={creatingHousehold} className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{creatingHousehold ? "Creating house…" : "Create House"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {householdToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="delete-household-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="delete-household-title" className="text-xl font-bold text-red-700">Permanently delete house?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">This will permanently delete the selected house, its users, financial records and uploaded bills. This cannot be undone.</p>
            <label className="mt-5 block text-sm font-semibold text-slate-700">Type <span className="select-all">{householdToDelete.name}</span> to confirm<input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => { setHouseholdToDelete(null); setDeleteConfirmation(""); }} disabled={deletingHousehold} className="rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-700">Cancel</button>
              <button onClick={() => void handleDeleteHousehold()} disabled={deletingHousehold || deleteConfirmation.trim() !== householdToDelete.name.trim()} className="rounded-xl bg-red-700 px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{deletingHousehold ? "Deleting…" : "Permanently Delete House"}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
