import { useEffect, useState } from "react";
import "./App.css";
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
	const [rechargeAmount, setRechargeAmount] = useState("100");
	const [taskPrompt, setTaskPrompt] = useState("");
	const [taskMessage, setTaskMessage] = useState("");

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
			setStoredToken(data.token);
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
		if (!token || !user) {
			return;
		}
		setLoading(true);
		setError("");
		try {
			const amountValue = parseInt(rechargeAmount, 10);
			const data = (await apiRequest("/api/v1/credits/recharge", {
				method: "POST",
				body: JSON.stringify({ amount: amountValue, description: "desktop" }),
				headers: {
					Authorization: "Bearer " + token,
				},
			})) as { balance: number };
			setUser({ ...user, balance: data.balance });
		} catch (e: any) {
			setError("充值失败");
		} finally {
			setLoading(false);
		}
	}

	async function handleStartTask(e: React.FormEvent) {
		e.preventDefault();
		if (!token) {
			return;
		}
		setLoading(true);
		setError("");
		setTaskMessage("");
		try {
			const data = (await apiRequest("/api/v1/tasks/start", {
				method: "POST",
				body: JSON.stringify({ prompt: taskPrompt }),
				headers: {
					Authorization: "Bearer " + token,
				},
			})) as { task_id: string; message: string };
			setTaskMessage(data.message + " (任务ID: " + data.task_id + ")");
			const me = (await apiRequest("/api/v1/auth/me", {
				headers: {
					Authorization: "Bearer " + token,
				},
			})) as AuthResponseUser;
			setUser({ id: me.id, email: me.email, balance: me.balance });
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

	return (
		<main className="container">
			<h1>HyperAgent Desktop</h1>
			{loading && <p>处理中...</p>}
			{error && <p style={{ color: "red" }}>{error}</p>}
			{view === "login" && (
				<section>
					<h2>登录</h2>
					<form onSubmit={handleLogin}>
						<input
							type="email"
							placeholder="Email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
						<input
							type="password"
							placeholder="密码"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
						<button type="submit" disabled={loading}>
							登录
						</button>
					</form>
					<button onClick={() => setView("register")}>去注册</button>
				</section>
			)}
			{view === "register" && (
				<section>
					<h2>注册</h2>
					<form onSubmit={handleRegister}>
						<input
							type="email"
							placeholder="Email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
						<input
							type="password"
							placeholder="密码"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
						<button type="submit" disabled={loading}>
							注册
						</button>
					</form>
					<button onClick={() => setView("login")}>已有账号去登录</button>
				</section>
			)}
			{view === "main" && user && (
				<section>
					<h2>账户</h2>
					<p>邮箱：{user.email}</p>
					<p>积分余额：{user.balance}</p>
					<button onClick={handleLogout}>退出登录</button>
					<h3>充值积分</h3>
					<form onSubmit={handleRecharge}>
						<input
							type="number"
							value={rechargeAmount}
							onChange={(e) => setRechargeAmount(e.target.value)}
						/>
						<button type="submit" disabled={loading}>
							充值
						</button>
					</form>
					<h3>启动任务</h3>
					<form onSubmit={handleStartTask}>
						<textarea
							placeholder="输入任务指令..."
							value={taskPrompt}
							onChange={(e) => setTaskPrompt(e.target.value)}
						/>
						<button type="submit" disabled={loading}>
							开始任务
						</button>
					</form>
					{taskMessage && <p>{taskMessage}</p>}
				</section>
			)}
		</main>
	);
}

export default App;
