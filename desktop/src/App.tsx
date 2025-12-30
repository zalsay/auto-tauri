import { useEffect, useState } from "react";
import "./App.css";
import { apiRequest, clearStoredToken, getStoredToken, setStoredToken } from "./api";
import { Command } from "@tauri-apps/plugin-shell";

type View = "login" | "register" | "main";

type User = {
	id: string;
	email: string;
	balance: number;
};
// ... rest of types

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
	// ... existing state
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [user, setUser] = useState<User | null>(null);
	const [token, setToken] = useState<string>("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string>("");
	const [rechargeAmount, setRechargeAmount] = useState("100");
	const [targetUrl, setTargetUrl] = useState("");
	const [taskPrompt, setTaskPrompt] = useState("");
	const [taskMessage, setTaskMessage] = useState("");
	const [taskLogs, setTaskLogs] = useState<string[]>([]);

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
		setTaskLogs([]);
		try {
			// 1. Deduct credits via Backend
			const data = (await apiRequest("/api/v1/tasks/start", {
				method: "POST",
				body: JSON.stringify({ prompt: taskPrompt }),
				headers: {
					Authorization: "Bearer " + token,
				},
			})) as { task_id: string; message: string };
			
			setTaskMessage(data.message + " (任务ID: " + data.task_id + ")");
			
			// Refresh User Balance
			const me = (await apiRequest("/api/v1/auth/me", {
				headers: {
					Authorization: "Bearer " + token,
				},
			})) as AuthResponseUser;
			setUser({ id: me.id, email: me.email, balance: me.balance });

			// 2. Start Sidecar
			const command = Command.sidecar("hyperagent");
			
			command.stderr.on('data', (line) => {
				console.log('STDERR:', line);
				try {
					const logEvent = JSON.parse(line);
					setTaskLogs(prev => [...prev, `[${logEvent.type}] ${logEvent.message}`]);
				} catch {
					setTaskLogs(prev => [...prev, line]);
				}
			});

			command.stdout.on('data', (line) => {
				console.log('STDOUT:', line);
				try {
					const result = JSON.parse(line);
					setTaskMessage(prev => prev + "\n执行结果: " + JSON.stringify(result.data));
				} catch {
					// Ignore raw output if not JSON
				}
			});

			const child = await command.spawn();
			console.log("Sidecar spawned");

			const taskType = targetUrl ? "xhs_automation" : "default";

			const payload = JSON.stringify({
				taskId: data.task_id,
				type: taskType,
				url: targetUrl, 
				prompt: taskPrompt
			});
			
			await child.write(payload + "\n");
			console.log("Payload sent");

		} catch (e: any) {
			console.error(e);
			setError("启动任务失败: " + (e.message || "Unknown error"));
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
						<div style={{ marginBottom: '10px' }}>
							<input
								type="text"
								placeholder="目标网址 (为空则运行模拟测试)"
								value={targetUrl}
								onChange={(e) => setTargetUrl(e.target.value)}
								style={{ width: '100%', padding: '8px' }}
							/>
						</div>
						<div style={{ marginBottom: '10px' }}>
							<textarea
								placeholder="输入任务指令 (例如: 抓取页面并发布到小红书)"
								value={taskPrompt}
								onChange={(e) => setTaskPrompt(e.target.value)}
								style={{ width: '100%', minHeight: '80px', padding: '8px' }}
							/>
						</div>
						<button type="submit" disabled={loading}>
							开始任务
						</button>
					</form>
					{taskMessage && <pre style={{textAlign: 'left', background: '#f0f0f0', padding: '10px'}}>{taskMessage}</pre>}
					{taskLogs.length > 0 && (
						<div style={{textAlign: 'left', background: '#333', color: '#fff', padding: '10px', marginTop: '10px', height: '200px', overflowY: 'scroll'}}>
							{taskLogs.map((log, i) => <div key={i}>{log}</div>)}
						</div>
					)}
				</section>
			)}
		</main>
	);
}

export default App;
