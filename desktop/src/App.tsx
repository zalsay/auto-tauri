import { useEffect, useState } from "react";
import { apiRequest, clearStoredToken, getStoredToken, setStoredToken } from "./api";

type View = "login" | "register" | "main";

type User = {
  id: string;
  email: string;
  balance: number;
};

type AuthResponseUser = {
  id: string;
  email: string;
  balance: number;
};

type AuthResponse = {
  token: string;
  user: AuthResponseUser;
};

function App() {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [rememberMe, setRememberMe] = useState(false);
  
  // Dashboard inputs
  const [rechargeAmount, setRechargeAmount] = useState("100");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [taskMessage, setTaskMessage] = useState("");
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskType, setTaskType] = useState<"workflow" | "scrape">("workflow");

  useEffect(() => {
    const storedToken = getStoredToken();
    if (!storedToken) {
      return;
    }
    setToken(storedToken);
    loadMe(storedToken);
  }, []);

  async function loadMe(authToken: string) {
    setLoading(true);
    setError("");
    try {
      const data = (await apiRequest("/api/v1/auth/me", {
        headers: {
          Authorization: "Bearer " + authToken,
        },
      })) as AuthResponseUser;
      setUser({ id: data.id, email: data.email, balance: data.balance });
      setView("main");
    } catch (e: any) {
      clearStoredToken();
      setToken("");
      setUser(null);
      setView("login");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiRequest("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setView("login");
      setError("注册成功，请登录");
    } catch (e: any) {
      setError("注册失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = (await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })) as AuthResponse;
      if (rememberMe) {
        setStoredToken(data.token);
      } else {
        clearStoredToken();
      }
      setToken(data.token);
      setUser({ id: data.user.id, email: data.user.email, balance: data.user.balance });
      setView("main");
    } catch (e: any) {
      setError("登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecharge(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !user) return;
    setLoading(true);
    setError("");
    try {
      const amountValue = parseInt(rechargeAmount, 10);
      const data = (await apiRequest("/api/v1/credits/recharge", {
        method: "POST",
        body: JSON.stringify({ amount: amountValue, description: "desktop" }),
        headers: { Authorization: "Bearer " + token },
      })) as { balance: number };
      setUser({ ...user, balance: data.balance });
      setRechargeAmount("");
      alert("充值成功！");
    } catch (e: any) {
      setError("充值失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleStartTask(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError("");
    setTaskMessage("");
    try {
      const data = (await apiRequest("/api/v1/tasks/start", {
        method: "POST",
        body: JSON.stringify({ prompt: taskPrompt, type: taskType }),
        headers: { Authorization: "Bearer " + token },
      })) as { task_id: string; message: string };
      setTaskMessage(data.message + " (任务ID: " + data.task_id + ")");
      // Refresh balance
      const me = (await apiRequest("/api/v1/auth/me", {
        headers: { Authorization: "Bearer " + token },
      })) as AuthResponseUser;
      setUser({ id: me.id, email: me.email, balance: me.balance });
      setTaskPrompt("");
    } catch (e: any) {
      setError("启动任务失败");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearStoredToken();
    setToken("");
    setUser(null);
    setView("login");
  }

  // Auth Layout (Login/Register)
  if (view === "login" || view === "register") {
    const isLogin = view === "login";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-light dark:bg-background-dark p-4">
        <div className="w-full max-w-md rounded-xl bg-surface-light dark:bg-surface-dark p-8 shadow-lg border border-slate-200 dark:border-slate-800">
          <div className="mb-6 flex items-center justify-center gap-3">
             <div className="size-10 rounded bg-gradient-primary flex items-center justify-center text-white shadow-md shadow-blue-600/20">
                <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>check_circle</span>
             </div>
             <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-700 to-purple-700 dark:from-blue-500 dark:to-purple-500 bg-clip-text text-transparent">
               任务大师
             </h1>
          </div>
          <h2 className="mb-6 text-xl font-bold text-slate-900 dark:text-white text-center">
            {isLogin ? "欢迎回来" : "创建账户"}
          </h2>
          
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-500 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={isLogin ? handleLogin : handleRegister} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">邮箱</label>
              <input
                type="email"
                className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm text-slate-900 placeholder:text-[#d1d5db] focus:border-accent-blue focus:ring-accent-blue dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-[#9ca3af]"
                placeholder="请输入邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">密码</label>
              <input
                type="password"
                className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm text-slate-900 placeholder:text-[#d1d5db] focus:border-accent-blue focus:ring-accent-blue dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-[#9ca3af]"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            
            {isLogin && (
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:ring-offset-slate-800"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-900 dark:text-slate-300 select-none cursor-pointer">
                  自动登录
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-gradient-primary px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-hover focus:outline-none focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800 disabled:opacity-50 transition-all shadow-lg shadow-purple-600/30 hover:shadow-purple-600/40"
            >
              {loading ? "处理中..." : (isLogin ? "登录" : "注册")}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              {isLogin ? "还没有账号？" : "已有账号？"}
            </span>
            <button
              onClick={() => setView(isLogin ? "register" : "login")}
              className="font-medium text-accent-blue hover:underline dark:text-blue-500"
            >
              {isLogin ? "注册" : "登录"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Dashboard Layout
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-white font-display">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-background-dark lg:flex">
        <div className="flex h-16 items-center gap-3 px-6 border-b border-slate-200 dark:border-slate-800">
          <div className="size-8 rounded bg-gradient-primary flex items-center justify-center text-white shadow-md shadow-blue-600/20">
            <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>check_circle</span>
          </div>
          <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-700 to-purple-700 dark:from-blue-500 dark:to-purple-500 bg-clip-text text-transparent">
            任务大师
          </h1>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 py-6">
          <ul className="flex flex-col gap-2">
            <li>
              <a href="#" className="flex items-center gap-3 rounded-lg bg-gradient-primary shadow-lg shadow-purple-600/20 px-3 py-2 text-white">
                <span className="material-symbols-outlined fill">dashboard</span>
                <span className="text-sm font-medium">仪表盘</span>
              </a>
            </li>
            <li>
              <a href="#" className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50 transition-colors group">
                <span className="material-symbols-outlined group-hover:text-accent-blue transition-colors">view_kanban</span>
                <span className="text-sm font-medium">项目</span>
              </a>
            </li>
            <li>
              <a href="#" className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50 transition-colors group">
                <span className="material-symbols-outlined group-hover:text-accent-blue transition-colors">check_box</span>
                <span className="text-sm font-medium">任务</span>
              </a>
            </li>
            <li>
              <a href="#" className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50 transition-colors group">
                <span className="material-symbols-outlined group-hover:text-accent-blue transition-colors">group</span>
                <span className="text-sm font-medium">团队</span>
              </a>
            </li>
            <li>
              <a href="#" className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50 transition-colors group">
                <span className="material-symbols-outlined group-hover:text-accent-blue transition-colors">settings</span>
                <span className="text-sm font-medium">设置</span>
              </a>
            </li>
          </ul>
        </nav>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
           <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400">
             <span className="material-symbols-outlined">logout</span>
             <span className="text-sm font-medium">退出登录</span>
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex flex-1 flex-col overflow-hidden relative">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-background-dark px-6 lg:px-10 z-10">
          <button className="mr-4 lg:hidden text-slate-500 dark:text-white">
            <span className="material-symbols-outlined">menu</span>
          </button>
          <div className="flex flex-1 max-w-lg">
             <div className="relative w-full group">
               <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 group-focus-within:text-accent-blue transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>search</span>
              </div>
              <input className="block w-full rounded-lg border-none bg-slate-50 py-2 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-accent-purple/50 dark:bg-surface-dark dark:text-white dark:placeholder:text-slate-500 transition-all" placeholder="搜索任务、项目..." type="text"/>
            </div>
         </div>
         <div className="ml-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
               <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block">{user?.email}</span>
               <div className="size-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                 {user?.email.substring(0, 2).toUpperCase()}
               </div>
            </div>
         </div>
       </header>

       <div className="flex-1 overflow-y-auto p-6 lg:p-10 scroll-smooth">
         <div className="mx-auto max-w-7xl flex flex-col gap-8">
           
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             {/* Left Column: Stats */}
             <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   {/* Balance Card with Recharge */}
                   <div className="flex flex-col gap-4 rounded-xl bg-surface-light p-6 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800 hover:border-accent-blue/30 dark:hover:border-accent-blue/30 transition-all">
                     <div className="flex items-center justify-between">
                       <p className="text-sm font-medium text-slate-500 dark:text-slate-400">总余额</p>
                       <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-light text-accent-blue">
                         <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>account_balance_wallet</span>
                       </div>
                     </div>
                     <div>
                        <p className="text-3xl font-bold text-slate-900 dark:text-white">{user?.balance}</p>
                        <p className="text-sm font-medium text-emerald-500">可用积分</p>
                     </div>
                     {/* Recharge Form */}
                     <form onSubmit={handleRecharge} className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm text-slate-900 focus:border-accent-blue focus:ring-accent-blue dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          value={rechargeAmount}
                          onChange={(e) => setRechargeAmount(e.target.value)}
                          min="1"
                          placeholder="金额"
                        />
                        <button
                          type="submit"
                          disabled={loading}
                          className="whitespace-nowrap rounded-lg bg-gradient-primary px-4 py-2 text-center text-sm font-medium text-white hover:bg-gradient-hover transition-all shadow-lg shadow-purple-600/20"
                        >
                          充值
                        </button>
                     </form>
                   </div>
                   
                   {/* Active Tasks Card */}
                   <div className="flex flex-col gap-2 rounded-xl bg-surface-light p-6 shadow-sm dark:bg-surface-dark border border-slate-200 dark:border-slate-800 hover:border-accent-blue/30 dark:hover:border-accent-blue/30 transition-all">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">进行中的任务</p>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
                          <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>hourglass_empty</span>
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-slate-900 dark:text-white">0</p>
                      <p className="text-sm font-medium text-slate-500">无进行中的任务</p>
                   </div>
                </div>
             </div>

             {/* Right Column: Start Task Button */}
             <div className="lg:col-span-1">
               <div className="h-full flex items-start justify-center lg:justify-end">
                  <button 
                    onClick={() => { setTaskMessage(""); setError(""); setIsTaskModalOpen(true); }}
                    className="flex flex-col items-center justify-center gap-3 w-full h-full min-h-[160px] rounded-xl bg-surface-light p-6 shadow-sm dark:bg-surface-dark border border-dashed border-slate-300 dark:border-slate-700 hover:border-accent-blue hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group cursor-pointer"
                  >
                     <div className="size-12 rounded-full bg-gradient-primary flex items-center justify-center text-white shadow-lg shadow-purple-600/20 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>add</span>
                     </div>
                     <span className="text-lg font-bold text-slate-700 dark:text-slate-300 group-hover:text-accent-blue transition-colors">开始新任务</span>
                  </button>
               </div>
             </div>
           </div>
          </div>
        </div>
      </main>

      {/* Task Modal */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="w-full max-w-lg rounded-xl bg-surface-light dark:bg-surface-dark p-6 shadow-2xl border border-slate-200 dark:border-slate-800 scale-100 animate-in zoom-in-95 duration-200">
              <div className="mb-6 flex items-center justify-between">
                 <h3 className="text-xl font-bold text-slate-900 dark:text-white">开始新任务</h3>
                 <button 
                   onClick={() => setIsTaskModalOpen(false)}
                   className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                 >
                   <span className="material-symbols-outlined">close</span>
                 </button>
              </div>
              
              <form onSubmit={handleStartTask} className="flex flex-col gap-4">
                 <div className="flex flex-col gap-2">
                   <label className="text-sm font-medium text-slate-700 dark:text-slate-300">任务类型</label>
                   <div className="flex gap-4">
                     <label className={`flex flex-1 cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${taskType === 'workflow' ? 'border-accent-blue bg-blue-50 dark:bg-blue-900/20 dark:border-blue-500' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'}`}>
                       <input 
                         type="radio" 
                         name="taskType" 
                         value="workflow"
                         checked={taskType === 'workflow'} 
                         onChange={() => setTaskType('workflow')}
                         className="h-4 w-4 text-accent-blue focus:ring-accent-blue"
                       />
                       <div className="flex flex-col">
                         <span className="text-sm font-medium text-slate-900 dark:text-white">自动工作流</span>
                         <span className="text-xs text-slate-500 dark:text-slate-400">执行通用自动化任务</span>
                       </div>
                     </label>
                     <label className={`flex flex-1 cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${taskType === 'scrape' ? 'border-accent-blue bg-blue-50 dark:bg-blue-900/20 dark:border-blue-500' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'}`}>
                       <input 
                         type="radio" 
                         name="taskType" 
                         value="scrape"
                         checked={taskType === 'scrape'} 
                         onChange={() => setTaskType('scrape')}
                         className="h-4 w-4 text-accent-blue focus:ring-accent-blue"
                       />
                       <div className="flex flex-col">
                         <span className="text-sm font-medium text-slate-900 dark:text-white">网页获取</span>
                         <span className="text-xs text-slate-500 dark:text-slate-400">抓取指定网页数据</span>
                       </div>
                     </label>
                   </div>
                 </div>

                 <div>
                   <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">任务提示词</label>
                   <textarea
                     className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 focus:border-accent-blue focus:ring-accent-blue dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                     rows={5}
                     placeholder="请详细描述您需要完成的自动化任务..."
                     value={taskPrompt}
                     onChange={(e) => setTaskPrompt(e.target.value)}
                     autoFocus
                   />
                 </div>
                 
                 {taskMessage && (
                   <div className="rounded-lg bg-green-50 p-3 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400 flex items-center gap-2">
                     <span className="material-symbols-outlined text-sm">check_circle</span>
                     {taskMessage}
                   </div>
                 )}
                 
                 {error && (
                   <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 flex items-center gap-2">
                     <span className="material-symbols-outlined text-sm">error</span>
                     {error}
                   </div>
                 )}

                 <div className="mt-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsTaskModalOpen(false)}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-lg bg-gradient-primary px-5 py-2 text-center text-sm font-medium text-white hover:bg-gradient-hover transition-all shadow-lg shadow-purple-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? "启动中..." : "开始任务"}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}

export default App;
