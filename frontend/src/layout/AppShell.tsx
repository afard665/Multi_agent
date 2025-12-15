import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAdminStatusStore } from "../store/adminStatus";
import { useAuthStore } from "../store/auth";
import { useClientSettingsStore } from "../store/clientSettings";

const nav = [
  { to: "/", label: "Ask" },
  { to: "/logs", label: "Log" },
  { to: "/agents", label: "Agents" },
  { to: "/workflows", label: "Workflows" },
  { to: "/docs", label: "Docs" },
  { to: "/tokens", label: "Costs" },
  { to: "/settings", label: "Settings" },
];

function navLinkClass(isActive: boolean) {
  return [
    "flex items-center gap-2 px-3 py-2 rounded text-sm transition",
    isActive ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700 hover:bg-gray-100",
  ].join(" ");
}

function AdminModePill() {
  const { status, load } = useAdminStatusStore();
  useEffect(() => {
    void load();
  }, []);

  const mode = status?.mode || "disabled";
  const label = mode === "insecure" ? "Admin: local" : mode === "key" ? "Admin: key" : "Admin: off";
  const cls =
    mode === "insecure"
      ? "bg-amber-100 text-amber-800"
      : mode === "key"
        ? "bg-emerald-100 text-emerald-800"
        : "bg-gray-100 text-gray-700";

  return <span className={`text-xs px-2 py-1 rounded ${cls}`}>{label}</span>;
}

export default function AppShell() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const { setAdminApiKey, setAskApiKey } = useClientSettingsStore();

  const onLogout = () => {
    logout();
    setAdminApiKey("");
    setAskApiKey("");
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        <aside className="hidden md:flex md:w-64 md:flex-col md:sticky md:top-0 md:h-screen bg-white border-r">
          <div className="p-4">
            <div className="text-sm text-gray-500">Multi-Agent Platform</div>
            <div className="text-lg font-bold">Dashboard</div>
          </div>
          <nav className="px-2 space-y-1">
            {nav.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => navLinkClass(isActive)}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto p-4">
            <AdminModePill />
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="font-semibold">Multi-Agent Dashboard</div>
              <div className="flex items-center gap-3">
                <button className="text-sm text-gray-700 hover:text-gray-900" onClick={onLogout}>
                  Logout
                </button>
                <div className="md:hidden">
                  <AdminModePill />
                </div>
              </div>
            </div>
          </header>

          <main className="p-4 max-w-6xl mx-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
