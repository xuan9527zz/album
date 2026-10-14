import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Heart,
  Images,
  UsersRound,
  Plus,
  UserRound,
  LogOut,
  ArrowUpRight,
  ArrowLeft,
  Download,
  Trash2,
  MapPin,
  CalendarDays,
  LockKeyhole,
  CloudUpload,
  FolderOpen,
  Check,
  RefreshCw,
  X,
  ChevronRight,
  ChevronLeft,
  Leaf,
  WifiOff,
  MessageCircle,
  Bell,
  Send,
  Film,
} from "lucide-react";
import {
  type Photo,
  type UploadSession,
  formatBytes,
} from "../../../packages/shared/src/index";
import { auth, Client, configured, inviteMarker, localDemo } from "./client";
import { cachedImage, clearImageCache, imageInSession } from "./session-image-cache";
import { fileMime, metadata as readPhotoMetadata } from "./files";
import { usePwaCacheStatus, requestPwaPreload } from "./pwa-cache-status";
import { photoFilename } from "../../../packages/shared/src/photo-filename";
import {
  addDerivatives,
  addLiveVideo,
  cancel,
  journal,
  resume,
  uploadPhoto,
} from "./uploads";
const demoIDs = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];
const StoryArea = lazy(() =>
  import("./StoryStudio").then(({ StoryArea }) => ({ default: StoryArea })),
);
const PublicStoryReader = lazy(() =>
  import("./StoryStudio").then(({ PublicStoryReader }) => ({ default: PublicStoryReader })),
);
const appName = "唯味相册";
const dateText = (p: Photo) =>
  p.captured_local
    ? p.captured_local.slice(0, 10).replaceAll("-", ".")
    : `上传于 ${new Date(p.uploaded_at).toLocaleDateString("zh-CN")}`;
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "操作失败，请稍后重试";
type PhotoComment = {
  id: string;
  body: string;
  created_at: string;
  author_name: string;
  can_delete: boolean;
};
type Notice = { id: string; kind: "comment" | "like" | "chat"; photo_id: string | null; created_at: string; read_at: string | null; actor_name: string; photo_title: string | null };
type ChatMessage = { id: string; body: string; created_at: string; sender_id: string; sender_name: string };
function Logo() {
  return (
    <span className="logo-symbol">
      <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
    </span>
  );
}
function Avatar({ name, image, large = false }: { name: string; image?: string | null; large?: boolean }) {
  return <span className={`avatar${large ? " large" : ""}`}>
    {image ? <img src={image} alt="" /> : name.slice(0, 1)}
  </span>;
}
function Login({ onLocal }: { onLocal: (id: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await auth!.auth.signInWithPassword({ email, password });
      if (r.error) throw new Error("登录失败，请检查邮箱和密码或稍后重试");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <Logo />
          {appName}
        </div>
        <div className="story-art">
          <div className="art-sun" />
          <div className="art-mountain back" />
          <div className="art-mountain front" />
          <div className="art-caption">THE LITTLE THINGS, KEPT FOREVER.</div>
        </div>
        <p className="eyebrow">FOR YOU & YOUR EVERYDAY</p>
        <h1>
          平常的日子，
          <br />
          值得好好珍藏。
        </h1>
        <p>
          留下喜欢的瞬间。
          <br />
          让回忆，在这里慢慢生长。
        </p>
      </section>
      <section className="login-form">
        <span className="small-lock">
          <LockKeyhole size={16} /> 私密的个人空间
        </span>
        <h2>欢迎回来</h2>
        <p>登录，翻开属于你的相册。</p>
        {!configured ? (
          <div className="notice">
            <strong>相册尚未配置</strong>
            <p>
              管理员完成服务配置后即可登录。开发者可按项目说明启动独立本地演示。
            </p>
          </div>
        ) : localDemo ? (
          <div className="demo-login">
            <div className="notice">
              本地演示 · 合成图片 · 数据在服务重启后重置
            </div>
            {demoIDs.map((id, i) => (
              <button
                key={id}
                className="demo-person"
                onClick={() => onLocal(id)}
              >
                <span className="avatar">{["一", "二", "三", "四"][i]}</span>
                <span>
                  {i === 0
                    ? "我的示例相册"
                    : `家人${["", "二", "三", "四"][i]}的示例账号`}
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={submit}>
            <label>
              邮箱
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              密码
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "正在登录…" : "进入我的相册"}
              <ArrowUpRight size={18} />
            </button>
            <p className="fineprint">需要重置密码？请联系相册管理员。</p>
          </form>
        )}
        <p className="login-footer">
          <Leaf size={14} /> 不着急，回忆都在这里。
        </p>
      </section>
    </main>
  );
}
function InvitePassword({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 12) {
      setError("密码至少需要 12 位");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await auth!.auth.updateUser({ password });
      if (result.error) throw new Error("设置失败，请稍后重试或联系相册管理员");
      setPassword("");
      setConfirm("");
      sessionStorage.removeItem(inviteMarker);
      onComplete();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <Logo />
          {appName}
        </div>
        <p className="eyebrow">WELCOME TO OUR LITTLE SPACE</p>
        <h1>
          一起收藏，
          <br />
          平常的日子。
        </h1>
        <p>你的私人相册已经准备好了。</p>
      </section>
      <section className="login-form">
        <span className="small-lock">
          <LockKeyhole size={16} /> 家庭成员邀请
        </span>
        <h2>设置登录密码</h2>
        <p>以后用收到邀请的邮箱和这个密码登录。请自己设置，不要告诉别人。</p>
        <form onSubmit={submit}>
          <label>
            新密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <label>
            再次输入
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? "正在保存…" : "设置密码并进入相册"}
            <ArrowUpRight size={18} />
          </button>
          <p className="fineprint">
            邀请链接过期或设置失败？请联系相册管理员重新邀请。
          </p>
        </form>
      </section>
    </main>
  );
}
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/featured");
  useEffect(() => {
    const change = () => setRoute(location.hash.slice(1) || "/featured");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return route;
}
export default function App() {
  const publicRoute = useRoute().match(/^\/watch\/([0-9a-f]{64})$/);
  const [userID, setUserID] = useState<string | null>(null);
  const [invitePending, setInvitePending] = useState(
    () => sessionStorage.getItem(inviteMarker) === "1",
  );
  const [restoring, setRestoring] = useState(true);
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    window.addEventListener("pagehide", clearImageCache);
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if (localDemo) {
      setUserID(sessionStorage.getItem("album-demo-user"));
      setRestoring(false);
    } else if (auth) {
      auth.auth.getSession().then((r) => {
        setUserID(r.data.session?.user.id || null);
        setRestoring(false);
      });
      const sub = auth.auth.onAuthStateChange((_event, session) => {
        setUserID(session?.user.id || null);
        setRestoring(false);
      });
      return () => {
        sub.data.subscription.unsubscribe();
        window.removeEventListener("pagehide", clearImageCache);
        window.removeEventListener("online", update);
        window.removeEventListener("offline", update);
      };
    } else setRestoring(false);
    return () => {
      window.removeEventListener("pagehide", clearImageCache);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const loginLocal = (id: string) => {
    sessionStorage.setItem("album-demo-user", id);
    setUserID(id);
    location.hash = "/featured";
  };
  const logout = async () => {
    clearImageCache();
    setUserID(null);
    setInvitePending(false);
    sessionStorage.removeItem(inviteMarker);
    sessionStorage.removeItem("album-demo-user");
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("album-pending:")) sessionStorage.removeItem(key);
    }
    if (auth) await auth.auth.signOut({ scope: "local" });
    location.hash = "/featured";
  };
  return (
    <>
      {offline && (
        <div className="offline-banner">
          <WifiOff size={16} /> 当前离线，请联网后查看或上传照片。
        </div>
      )}
      {localDemo && (
        <div className="demo-banner">本地演示 · 合成图片 · 未连接云服务</div>
      )}
      {publicRoute ? (
        <Suspense fallback={<div className="boot">正在打开影集…</div>}><PublicStoryReader key={publicRoute[1]} token={publicRoute[1]} /></Suspense>
      ) : restoring ? (
        <div className="boot">
          <Logo />
          <p>正在打开相册…</p>
        </div>
      ) : userID && invitePending ? (
        <InvitePassword onComplete={() => setInvitePending(false)} />
      ) : userID ? (
        <Album key={userID} userID={userID} logout={logout} />
      ) : (
        <Login onLocal={loginLocal} />
      )}
    </>
  );
}
function Album({
  userID,
  logout,
}: {
  userID: string;
  logout: () => Promise<void>;
}) {
  const client = useMemo(() => new Client(userID), [userID]);
  const route = useRoute();
  const [me, setMe] = useState<any>(null);
  const [memberError, setMemberError] = useState("");
  const [revision, setRevision] = useState(0);
  const [unread, setUnread] = useState(0);
  const navigationLists = useRef<Record<"featured" | "all" | "shared", string[]>>({
    featured: [], all: [], shared: [],
  });
  useEffect(() => {
    let active = true;
    client
      .request("/v1/me")
      .then((x) => {
        if (active) setMe(x);
      })
      .catch((e) => {
        if (active) setMemberError(errorText(e));
      });
    return () => {
      active = false;
      client.stop();
    };
  }, [client]);
  useEffect(() => {
    let live = true;
    const refreshUnread = async () => {
      if (document.hidden) return;
      try {
        const result = await client.request<{ unread_count: number }>("/v1/notifications");
        if (live) setUnread(result.unread_count);
      } catch { /* The inbox will retry when the app is active. */ }
    };
    void refreshUnread();
    const timer = window.setInterval(refreshUnread, 30000);
    document.addEventListener("visibilitychange", refreshUnread);
    return () => { live = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", refreshUnread); };
  }, [client]);
  const refresh = () => {
    setRevision((n) => n + 1);
    client
      .request("/v1/me")
      .then(setMe)
      .catch(() => {});
  };
  const exit = async () => {
    try {
      if (localDemo || !("serviceWorker" in navigator)) throw new Error("no push");
      const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (subscription) {
        await client.request("/v1/push/subscription", { endpoint: subscription.endpoint }, "DELETE");
        await subscription.unsubscribe();
      }
    } catch { /* Logging out still works when the device is offline. */ }
    client.stop();
    await logout();
  };
  const tab = route.startsWith("/all")
    ? "all"
    : route.startsWith("/stories")
      ? "stories"
    : route.startsWith("/shared") || route.endsWith("/shared")
      ? "shared"
    : route.startsWith("/trash")
      ? "trash"
    : route.startsWith("/messages")
      ? "messages"
    : route.startsWith("/upload")
      ? "upload"
      : route.startsWith("/me")
        ? "me"
        : "featured";
  if (memberError)
    return (
      <div className="access-error">
        <Logo />
        <h2>暂时无法打开相册</h2>
        <p role="alert">{memberError}</p>
        <button className="primary" onClick={exit}>
          返回登录
        </button>
        <button className="quiet" onClick={() => location.reload()}>
          重新连接
        </button>
      </div>
    );
  if (!me)
    return (
      <div className="boot">
        <Logo />
        <p>正在加载个人空间…</p>
      </div>
    );
  const nav = [
    { key: "featured", icon: Heart, name: "精选时光" },
    { key: "all", icon: Images, name: "全部照片" },
    { key: "shared", icon: UsersRound, name: "共享相册" },
    { key: "stories", icon: Film, name: "影集" },
    { key: "messages", icon: MessageCircle, name: "消息" },
    { key: "me", icon: UserRound, name: "我的" },
  ];
  return (
    <div className="album-layout">
      <aside className="sidebar">
        <a className="brand" href="#/featured">
          <Logo />
          {appName}
        </a>
        <nav>
          {nav.map((n) => (
            <a
              key={n.key}
              href={`#/${n.key}`}
              className={tab === n.key ? "active" : ""}
            >
              <n.icon size={20} />
              {n.name}
              {n.key === "messages" && unread > 0 && <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>}
              {n.key === "featured" && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-label">
            <LockKeyhole size={15} /> 仅自己可见
          </div>
          <button
            className="profile-pill"
            onClick={() => {
              location.hash = "/me";
            }}
          >
            <Avatar name={me.display_name} image={me.avatar_data_url} />
            <span>
              {me.display_name}
              <small>个人资料</small>
            </span>
            <ChevronRight size={17} />
          </button>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <div className="mobile-brand">
            <Logo />
            {appName}
          </div>
          <span className="desktop-greeting">欢迎回来，{me.display_name}</span>
          <div className="topbar-right">
            <span className="small-lock">我的相册</span>
            <a className="add-button" href="#/upload">
              <Plus size={17} />
              <span>添加照片</span>
            </a>
          </div>
        </header>
        <main className="main-content">
          {tab === "featured" || tab === "all" || tab === "shared" ? (
            <Gallery
              key={`${tab}-${revision}`}
              client={client}
              mode={tab as "featured" | "all" | "shared"}
              onVisible={(mode, ids) => { navigationLists.current[mode] = ids; }}
            />
          ) : null}
          {tab === "trash" && <TrashPage key={revision} client={client} onChange={refresh} />}
          {tab === "stories" && (
            <Suspense fallback={<div className="empty-state" role="status">正在打开影集…</div>}>
              <StoryArea client={client} route={route} />
            </Suspense>
          )}
          {tab === "messages" && <MessagesPage client={client} userID={userID} onRead={() => setUnread(0)} />}
          <div hidden={tab !== "upload"}>
            <Upload client={client} displayName={me.display_name} onChange={refresh} />
          </div>
          {tab === "me" && <MyPage me={me} client={client} onChange={refresh} logout={exit} />}
        </main>
      </div>
      <nav className="bottom-nav">
        {nav.map((n) => (
          <a
            key={n.key}
            href={`#/${n.key}`}
            className={tab === n.key ? "active" : ""}
          >
            <n.icon size={21} />
            {n.key === "messages" && unread > 0 && <span className="bottom-unread">{unread > 9 ? "9+" : unread}</span>}
            <span>
              {n.key === "featured"
                ? "精选"
                : n.key === "all"
                  ? "全部"
                  : n.key === "shared"
                    ? "共享"
                  : n.key === "stories"
                    ? "影集"
                  : n.key === "messages"
                    ? "消息"
                    : "我的"}
            </span>
          </a>
        ))}
      </nav>
      {route.startsWith("/photo/") && (
        <Detail
          key={route}
          client={client}
          photoID={route.split("/")[2]}
          returnTo={route.split("/")[3] === "shared" ? "/shared" : route.split("/")[3] === "featured" ? "/featured" : "/all"}
          navigationIDs={navigationLists.current[(route.split("/")[3] === "shared" || route.split("/")[3] === "featured") ? route.split("/")[3] as "shared" | "featured" : "all"]}
          onChange={refresh}
        />
      )}
    </div>
  );
}
function MessagesPage({ client, userID, onRead }: { client: Client; userID: string; onRead: () => void }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pushState, setPushState] = useState("" );
  const bottom = useRef<HTMLDivElement>(null);
  async function load() {
    try {
      const [inbox, chat] = await Promise.all([
        client.request<{ items: Notice[]; unread_count: number }>("/v1/notifications"),
        client.request<{ messages: ChatMessage[] }>("/v1/chat"),
      ]);
      setNotices(inbox.items);
      setMessages(chat.messages);
      if (inbox.unread_count) {
        await client.request("/v1/notifications/read", {});
        onRead();
      }
    } catch (e) { setError(errorText(e)); }
  }
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 15000);
    return () => window.clearInterval(timer);
  }, [client]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);
  async function send(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || Array.from(body).length > 300) return;
    setBusy(true); setError("");
    try {
      const sent = await client.request<ChatMessage>("/v1/chat", { body });
      setMessages((current) => [...current, sent]);
      setText("");
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function enablePush() {
    setPushState("正在开启通知…");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
        throw new Error("当前浏览器不支持锁屏推送。iPhone 请先用 Safari 将相册添加到主屏幕，再从主屏幕打开。");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("系统未允许通知，可在 iPhone 设置中重新开启");
      const key = await client.request<{ public_key: string | null }>("/v1/push/key");
      if (!key.public_key) throw new Error("推送服务尚未启用，请稍后重试");
      const reg = await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        const raw = key.public_key.replace(/-/g, "+").replace(/_/g, "/");
        const bytes = Uint8Array.from(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
        subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes.buffer });
      }
      const json = subscription.toJSON();
      await client.request("/v1/push/subscription", { endpoint: json.endpoint, keys: json.keys });
      setPushState("已开启锁屏推送");
    } catch (e) { setPushState(errorText(e)); }
  }
  return <section className="messages-page">
    <div className="gallery-heading"><div><p className="eyebrow">FAMILY NOTES</p><h1>消息</h1><p>家人的互动和群聊都在这里。</p></div></div>
    <div className="message-grid">
      <section className="message-panel" aria-label="照片互动通知">
        <header><Bell size={20}/><h2>照片动态</h2></header>
        {notices.filter((notice) => notice.kind !== "chat").length ?
          <div className="notice-list">{notices.filter((notice) => notice.kind !== "chat").map((notice) =>
            <a key={notice.id} className={`notice-item${notice.read_at ? "" : " unread"}`} href={`#/photo/${notice.photo_id}/shared`}>
              <span className="notice-icon">{notice.kind === "like" ? <Heart size={18}/> : <MessageCircle size={18}/>}</span>
              <span><strong>{notice.actor_name}{notice.kind === "like" ? "赞了" : "评论了"}你的共享照片</strong><small>{notice.photo_title || "查看照片"} · {new Date(notice.created_at).toLocaleString("zh-CN")}</small></span>
              <ChevronRight size={16}/>
            </a>)}</div> : <p className="message-empty">有新评论或点赞时，会在这里提醒你。</p>}
      </section>
      <section className="message-panel chat-panel" aria-label="家庭群聊">
        <header><UsersRound size={20}/><h2>家庭群聊</h2></header>
        <div className="chat-list">{messages.length ? messages.map((message) =>
          <article className={`chat-bubble${message.sender_id === userID ? " mine" : ""}`} key={message.id}>
            <small>{message.sender_name} · {new Date(message.created_at).toLocaleString("zh-CN")}</small>
            <p>{message.body}</p>
          </article>) : <p className="message-empty">给家人发第一条消息吧。</p>}<div ref={bottom}/></div>
        <form className="chat-compose" onSubmit={send}>
          <label className="sr-only" htmlFor="chat-message">发送消息</label>
          <input id="chat-message" value={text} maxLength={300} onChange={(event) => setText(event.target.value)} placeholder="发一条消息给家人" />
          <button className="primary" disabled={busy || !text.trim()} aria-label="发送消息"><Send size={18}/></button>
        </form>
        <button className="secondary push-button" type="button" onClick={() => void enablePush()}><Bell size={17}/> 开启锁屏推送</button>
        {pushState && <p className="push-status" role="status">{pushState}</p>}
      </section>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
function Gallery({ client, mode, onVisible }: { client: Client; mode: "featured" | "all" | "shared"; onVisible: (mode: "featured" | "all" | "shared", ids: string[]) => void }) {
  const featured = mode === "featured";
  const shared = mode === "shared";
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setURLs] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [placeInput, setPlaceInput] = useState("");
  const [place, setPlace] = useState("");
  const [owner, setOwner] = useState("");
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const active = useRef(true);
  const queryVersion = useRef(0);
  async function load(next?: string) {
    const version = ++queryVersion.current;
    setBusy(true);
    setError("");
    try {
      const r = await client.request<{
        photos: Photo[];
        urls?: { id: string; url: string }[];
        next_cursor: string | null;
      }>(
        `/v1/photos?${new URLSearchParams({
          shared: String(shared), featured: String(featured),
          ...(year ? { year } : {}), ...(month ? { month } : {}),
          ...(place ? { place } : {}), ...(shared && owner ? { owner } : {}),
          ...(next ? { cursor: next } : {}),
        })}`,
      );
      if (!active.current || version !== queryVersion.current) return;
      setPhotos((p) =>
        next
          ? [...p, ...r.photos.filter((x) => !p.some((y) => y.id === x.id))]
          : r.photos,
      );
      setCursor(r.next_cursor);
      if (r.urls) setURLs((old) => ({ ...old, ...Object.fromEntries(r.urls!.map((a) => [a.id, a.url])) }));
      else await authorize(r.photos);
    } catch (e) {
      if (active.current && version === queryVersion.current) setError(errorText(e));
    } finally {
      if (active.current && version === queryVersion.current) setBusy(false);
    }
  }
  async function authorize(items: Photo[]) {
    const ids = items
      .map(
        (p) =>
          p.assets.find((a) => a.role === "thumbnail") ||
          p.assets.find((a) => a.role === "preview"),
      )
      .filter(Boolean)
      .map((a) => a!.id)
      .filter((id) => !cachedImage(id));
    if (!ids.length) return;
    try {
      const r = await client.request<{ urls: { id: string; url: string }[] }>(
        "/v1/assets/read-urls",
        { ids },
      );
      if (active.current)
        setURLs((old) => ({
          ...old,
          ...Object.fromEntries(r.urls.map((a) => [a.id, a.url])),
        }));
    } catch (e) {
      if (active.current) setError(errorText(e));
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => setPlace(placeInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [placeInput]);
  useEffect(() => {
    if (!shared) return;
    client.request<{ id: string; name: string }[]>("/v1/members")
      .then(setMembers).catch((e) => { if (active.current) setError(errorText(e)); });
  }, [client, shared]);
  useEffect(() => {
    active.current = true;
    setPhotos([]);
    setCursor(null);
    void load();
    return () => {
      active.current = false;
      queryVersion.current++;
    };
  }, [mode, year, month, place, owner]);
  async function batch(operation: "feature_on" | "feature_off" | "share_on" | "share_off" | "trash") {
    if (!selected.length) return;
    setBatchBusy(true);
    setError("");
    try {
      await client.request("/v1/photos/batch", { ids: selected, operation });
      setSelected([]);
      setConfirmTrash(false);
      setSelecting(false);
      await load();
    } catch (e) { setError(errorText(e)); }
    finally { setBatchBusy(false); }
  }
  function clearFilters() {
    setYear(""); setMonth(""); setPlaceInput(""); setPlace(""); setOwner("");
  }
  const hasFilters = Boolean(year || month || place || owner);
  useEffect(() => { onVisible(mode, photos.map((p) => p.id)); }, [mode, photos]);
  const groups = featured
    ? [["精选", photos] as const]
    : Object.entries(
        photos.reduce<Record<string, Photo[]>>((g, p) => {
          const month = p.sort_date.slice(0, 7);
          (g[month] ||= []).push(p);
          return g;
        }, {}),
      );
  return (
    <section>
      <div className="gallery-heading">
        <div>
          <h1>
            {featured ? "往事总在回忆时被赋予意义" : shared ? "共享相册" : "全部照片"}
          </h1>
          {shared && <p>家庭成员都能查看和添加共享照片。</p>}
        </div>
        <div className="heading-stamp">
          <Heart size={23} />
          <span>日常 · 珍藏</span>
        </div>
      </div>
      <div className="gallery-toolbar">
        <div className="view-label">
          {featured ? (
            <>
              <Heart size={17} fill="currentColor" /> 我的精选
            </>
          ) : shared ? (
            <><UsersRound size={18} /> 家庭共享</>
          ) : (
            <>
              <Images size={18} /> 全部照片
            </>
          )}
          <span>
            {photos.length}
            {cursor ? "+" : ""} 张
          </span>
        </div>
        {!featured && <div className="gallery-filters">
          <select aria-label="筛选年份" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">所有年份</option>
            {Array.from({ length: new Date().getFullYear() - 1899 }, (_, index) => new Date().getFullYear() - index)
              .map((value) => <option key={value} value={value}>{value} 年</option>)}
          </select>
          <select aria-label="筛选月份" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">所有月份</option>
            {Array.from({ length: 12 }, (_, index) => index + 1)
              .map((value) => <option key={value} value={value}>{value} 月</option>)}
          </select>
          <input className="search" aria-label="筛选地点" placeholder="搜索地点" value={placeInput}
            onChange={(e) => setPlaceInput(e.target.value)} />
          {shared && <select aria-label="筛选上传成员" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">所有成员</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>}
          {hasFilters && <button className="quiet" onClick={clearFilters}>清除筛选</button>}
        </div>}
        <button className="secondary select-toggle" onClick={() => { setSelecting(!selecting); setSelected([]); setConfirmTrash(false); }}>
          {selecting ? "完成选择" : "批量管理"}
        </button>
        <span className="sort-label">
          拍摄日期 ↓
        </span>
      </div>
      {selecting && <div className="batch-toolbar">
        <span>已选 {selected.length} 张（每次最多 50 张）{shared && " · 只能管理自己上传的照片"}</span>
        <button disabled={!selected.length || batchBusy} onClick={() => void batch("feature_on")}>加入精选</button>
        <button disabled={!selected.length || batchBusy} onClick={() => void batch("feature_off")}>移出精选</button>
        <button disabled={!selected.length || batchBusy} onClick={() => void batch("share_on")}>放入共享</button>
        <button disabled={!selected.length || batchBusy} onClick={() => void batch("share_off")}>移出共享</button>
        {confirmTrash ? <>
          <button className="danger" disabled={batchBusy} onClick={() => void batch("trash")}>确认移入最近删除</button>
          <button className="quiet" onClick={() => setConfirmTrash(false)}>取消</button>
        </> : <button disabled={!selected.length || batchBusy} onClick={() => setConfirmTrash(true)}>删除所选</button>}
      </div>}
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button className="quiet" onClick={() => load()}>
            重新连接
          </button>
        </div>
      )}
      {!busy && !photos.length && !error && (
        <div className="empty-state">
          <div className="empty-art">
            <Images size={42} />
            <Heart size={20} />
          </div>
          <h2>
            {hasFilters ? "没有找到符合条件的照片" : featured ? "还没有精选照片" : shared ? "还没有共享照片" : "还没有照片"}
          </h2>
          <p>
            {hasFilters ? "试试更换年份、月份、地点或成员。" : featured ? "可以在照片详情中加入精选。" : shared ? "上传时选择共享，或分享自己已有的照片。" : "从这里开始添加照片。"}
          </p>
          {hasFilters ? <button className="primary" onClick={clearFilters}>清除筛选</button>
            : featured ? <a className="primary" href="#/all">查看全部照片<ArrowUpRight size={18} /></a> : null}
        </div>
      )}
      {groups.map(([month, items]) => (
        <section className="photo-group" key={month}>
          {!featured && (
            <h2 className="month-heading">
              {month.replace("-", " 年 ")} 月<span>{items.length} 张</span>
            </h2>
          )}
          <div className="photo-grid">
            {items.map((p, index) => {
              const asset =
                p.assets.find((a) => a.role === "thumbnail") ||
                p.assets.find((a) => a.role === "preview");
              const cardBody = <>
                  <div className={`photo-frame frame-${index % 4}`}>
                    {asset && (urls[asset.id] || cachedImage(asset.id)) ? (
                      <PrivateImage
                        assetID={asset.id}
                        url={urls[asset.id]}
                        alt={p.title || "相册照片"}
                        eager={index < 4}
                        retry={() => authorize([p])}
                      />
                    ) : (
                      <div className="pending-image">
                        <Images size={30} />
                        <span>
                          {p.original_status === "saved"
                            ? "原件已保存 · 待补浏览图片"
                            : p.original_status === "failed"
                              ? "上传未完成"
                              : "正在保存原件"}
                        </span>
                      </div>
                    )}
                    {(p.is_featured || p.liked_by_me) && (
                      <span className="featured-badge">
                        <Heart size={14} fill="currentColor" />
                      </span>
                    )}
                    {p.live_status === "paired_unverified" && (
                      <span className="live-badge">配套视频已保存</span>
                    )}
                    {selecting && selected.includes(p.id) && <span className="selection-badge"><Check size={19} /></span>}
                  </div>
                  <div className="photo-caption">
                    <span>{p.title || "未命名照片"}</span>
                    <ArrowUpRight size={16} />
                    <small>{dateText(p)}{shared && p.owner_name ? ` · ${p.owner_name}` : ""}</small>
                  </div>
                </>;
              return selecting ? (
                <button type="button" className={`photo-card selectable${selected.includes(p.id) ? " selected" : ""}`}
                  key={p.id} disabled={shared && p.is_owner === false}
                  aria-pressed={selected.includes(p.id)}
                  aria-label={`选择照片 ${p.title || dateText(p)}`}
                  onClick={() => {
                    if (!selected.includes(p.id) && selected.length >= 50) {
                      setError("每次最多选择 50 张，请先处理已选照片。");
                      return;
                    }
                    setSelected((ids) => ids.includes(p.id) ? ids.filter((id) => id !== p.id) : [...ids, p.id]);
                  }}>
                  {cardBody}
                </button>
              ) : (
                <a className="photo-card" key={p.id} href={`#/photo/${p.id}/${mode}`}
                  aria-label={`打开照片 ${p.title || dateText(p)}`}>{cardBody}</a>
              );
            })}
          </div>
        </section>
      ))}
      {busy && (
        <div className="loading">
          <RefreshCw size={18} className="spin" /> 正在翻开回忆…
        </div>
      )}
      {cursor && !busy && (
        <button className="load-more" onClick={() => load(cursor)}>
          继续翻阅 <ChevronRight size={16} />
        </button>
      )}
    </section>
  );
}
function TrashPage({ client, onChange }: { client: Client; onChange: () => void }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setURLs] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyID, setBusyID] = useState<string | null>(null);
  const [confirmID, setConfirmID] = useState<string | null>(null);
  const [error, setError] = useState("");
  const active = useRef(true);
  async function load(next?: string) {
    setLoading(true);
    setError("");
    try {
      const result = await client.request<{ photos: Photo[]; urls?: { id: string; url: string }[]; next_cursor: string | null }>(
        `/v1/trash${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
      );
      if (!active.current) return;
      setPhotos((old) => next ? [...old, ...result.photos.filter((p) => !old.some((x) => x.id === p.id))] : result.photos);
      setCursor(result.next_cursor);
      const ids = result.photos.map((p) => p.assets.find((a) => a.role === "thumbnail") || p.assets.find((a) => a.role === "preview"))
        .filter(Boolean).map((a) => a!.id).filter((id) => !cachedImage(id));
      if (result.urls) setURLs((old) => ({ ...old, ...Object.fromEntries(result.urls!.map((x) => [x.id, x.url])) }));
      else if (ids.length) {
        const read = await client.request<{ urls: { id: string; url: string }[] }>("/v1/trash/read-urls", { ids });
        if (active.current) setURLs((old) => ({ ...old, ...Object.fromEntries(read.urls.map((x) => [x.id, x.url])) }));
      }
    } catch (e) { if (active.current) setError(errorText(e)); }
    finally { if (active.current) setLoading(false); }
  }
  useEffect(() => {
    active.current = true;
    void load();
    return () => { active.current = false; };
  }, []);
  async function act(photoID: string, operation: "restore" | "purge") {
    setBusyID(photoID);
    setError("");
    try {
      await client.request(`/v1/trash/${photoID}${operation === "restore" ? "/restore" : ""}`,
        operation === "restore" ? {} : undefined, operation === "restore" ? "POST" : "DELETE");
      setPhotos((old) => old.filter((p) => p.id !== photoID));
      setConfirmID(null);
      onChange();
    } catch (e) { setError(errorText(e)); }
    finally { setBusyID(null); }
  }
  return <section className="trash-page">
    <a className="back-link" href="#/me"><ArrowLeft size={17} /> 返回我的资料</a>
    <h1>最近删除</h1>
    <p>删除的照片保留 30 天，之后自动清理。保留期间仍占用相册容量。</p>
    {error && <p className="error" role="alert">{error} <button className="quiet" onClick={() => void load()}>重试</button></p>}
    {!loading && !photos.length && !error && <div className="empty-state"><Trash2 size={36} /><h2>最近没有删除的照片</h2></div>}
    <div className="trash-grid">{photos.map((p) => {
      const asset = p.assets.find((a) => a.role === "thumbnail") || p.assets.find((a) => a.role === "preview");
      const remaining = p.deleted_at ? Math.max(0, Math.ceil((new Date(p.deleted_at).getTime() + 30 * 86400000 - Date.now()) / 86400000)) : 0;
      return <article className="trash-card" key={p.id}>
        <div className="trash-image">{asset && (urls[asset.id] || cachedImage(asset.id)) ?
          <PrivateImage assetID={asset.id} url={urls[asset.id]} alt="" retry={async () => { await load(); }} /> : <Images size={28} />}</div>
        <div className="trash-card-body">
          <strong>{p.title || dateText(p)}</strong>
          <small>{remaining ? `还可恢复 ${remaining} 天` : "即将清理"}</small>
          <div className="trash-actions">
            <button className="secondary" disabled={busyID !== null || remaining === 0} onClick={() => void act(p.id, "restore")}>恢复</button>
            {confirmID === p.id ? <>
              <button className="danger" disabled={busyID !== null} onClick={() => void act(p.id, "purge")}>确认永久删除</button>
              <button className="quiet" onClick={() => setConfirmID(null)}>取消</button>
            </> : <button className="quiet" disabled={busyID !== null} onClick={() => setConfirmID(p.id)}>永久删除</button>}
          </div>
        </div>
      </article>;
    })}</div>
    {loading && <p className="loading"><RefreshCw size={18} className="spin" /> 正在加载…</p>}
    {cursor && !loading && <button className="load-more" onClick={() => void load(cursor)}>查看更多 <ChevronRight size={16} /></button>}
  </section>;
}
function PrivateImage({
  assetID,
  url,
  alt,
  eager = false,
  retry,
}: {
  assetID: string;
  url?: string;
  alt: string;
  eager?: boolean;
  retry: () => Promise<void>;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [src, setSrc] = useState(() => cachedImage(assetID) || (localDemo ? url || "" : ""));
  const retryRef = useRef(retry);
  retryRef.current = retry;
  useEffect(() => {
    let live = true;
    setFailed(false);
    const existing = cachedImage(assetID);
    if (existing) setSrc(existing);
    else if (localDemo) setSrc(url || "");
    else if (url) {
      setSrc("");
      imageInSession(assetID, url).then((imageURL) => {
        if (live) setSrc(imageURL);
      }).catch(() => {
        if (!live) return;
        if (attempt < 1) {
          setAttempt(1);
          void retryRef.current();
        } else setFailed(true);
      });
    }
    return () => { live = false; };
  }, [assetID, url, attempt]);
  return failed ? (
    <button
      className="image-retry"
      onClick={() => {
        setAttempt(0);
        setFailed(false);
        void retryRef.current();
      }}
    >
      <RefreshCw size={21} />
      点击重新加载图片
    </button>
  ) : (
    src ? <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      onError={() => {
        if (attempt < 1) {
          setAttempt((n) => n + 1);
          void retryRef.current();
        } else setFailed(true);
      }}
    /> : <div className="pending-image"><RefreshCw size={20} className="spin" /></div>
  );
}
function Detail({
  client,
  photoID,
  returnTo,
  navigationIDs,
  onChange,
}: {
  client: Client;
  photoID: string;
  returnTo: "/all" | "/shared" | "/featured";
  navigationIDs: string[];
  onChange: () => void;
}) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [url, setURL] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const [downloadLinks, setDownloadLinks] = useState<
    Record<string, { url: string; filename: string }>
  >({});
  const [preparedDownloads, setPreparedDownloads] = useState<
    Record<string, string>
  >({});
  const [shareFiles, setShareFiles] = useState<Record<string, File>>({});
  const [shareBusy, setShareBusy] = useState<string | null>(null);
  const [unshareableIDs, setUnshareableIDs] = useState<string[]>([]);
  const [savePopupAssetID, setSavePopupAssetID] = useState<string | null>(null);
  const [savePreviewFailed, setSavePreviewFailed] = useState(false);
  const [comments, setComments] = useState<PhotoComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState("");
  const savePopupOpen = useRef(false);
  const savePopupClose = useRef<HTMLButtonElement>(null);
  const localDownloadURLs = useRef(new Set<string>());
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const position = navigationIDs.indexOf(photoID);
  const previousID = position > 0 ? navigationIDs[position - 1] : null;
  const nextID = position >= 0 ? navigationIDs[position + 1] || null : null;
  function navigate(id: string | null) {
    if (id && !savePopupOpen.current) location.hash = `/photo/${id}${returnTo}`;
  }
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const needsLocalDownload =
    /AppleWebKit/.test(navigator.userAgent) &&
    !/(Chrome|Chromium|Edg)\//.test(navigator.userAgent);
  const input = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  useEffect(() => {
    if (savePopupAssetID) savePopupClose.current?.focus();
  }, [savePopupAssetID]);
  useEffect(() => {
    if (!photo?.is_shared) { setComments([]); return; }
    let live = true;
    client.request<{ comments: PhotoComment[] }>(`/v1/photos/${photoID}/comments`)
      .then((result) => { if (live) setComments(result.comments); })
      .catch((error) => { if (live) setCommentError(errorText(error)); });
    return () => { live = false; };
  }, [client, photoID, photo?.is_shared]);
  async function addComment(event: FormEvent) {
    event.preventDefault();
    const body = commentText.trim();
    if (!body || Array.from(body).length > 30) return;
    setCommentBusy(true);
    setCommentError("");
    try {
      const added = await client.request<PhotoComment>(`/v1/photos/${photoID}/comments`, { body });
      setComments((current) => [...current, added]);
      setCommentText("");
    } catch (error) { setCommentError(errorText(error)); }
    finally { setCommentBusy(false); }
  }
  async function deleteComment(commentID: string) {
    setCommentBusy(true);
    setCommentError("");
    try {
      await client.request(`/v1/photos/${photoID}/comments/${commentID}`, undefined, "DELETE");
      setComments((current) => current.filter((comment) => comment.id !== commentID));
    } catch (error) { setCommentError(errorText(error)); }
    finally { setCommentBusy(false); }
  }
  function close() {
    if (savePopupOpen.current) {
      savePopupOpen.current = false;
      setSavePopupAssetID(null);
      return;
    }
    location.hash = returnTo;
  }
  async function load() {
    const p = await client.request<Photo & { preview_grant?: { url: string } }>(`/v1/photos/${photoID}`);
    setPhoto(p);
    setDate(p.captured_local?.slice(0, 16) || "");
    setTitle(p.title || "");
    setPlace(p.location_label || "");
    const a = p.assets.find((x) => x.role === "preview");
    if (p.preview_grant) setURL(p.preview_grant.url);
    else if (a && !cachedImage(a.id)) {
      const r = await client.request("/v1/assets/read-urls", { ids: [a.id] });
      setURL(r.urls[0].url);
    }
  }
  useEffect(() => {
    let live = true;
    client
      .request<Photo & { preview_grant?: { url: string } }>(`/v1/photos/${photoID}`)
      .then(async (p) => {
        if (!live) return;
        setPhoto(p);
        setDate(p.captured_local?.slice(0, 16) || "");
        setTitle(p.title || "");
        setPlace(p.location_label || "");
        const a = p.assets.find((x) => x.role === "preview");
        if (p.preview_grant) setURL(p.preview_grant.url);
        else if (a && !cachedImage(a.id)) {
          const r = await client.request("/v1/assets/read-urls", {
            ids: [a.id],
          });
          if (live) setURL(r.urls[0].url);
        }
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", escape);
    return () => {
      live = false;
      document.removeEventListener("keydown", escape);
      for (const objectURL of localDownloadURLs.current)
        URL.revokeObjectURL(objectURL);
      localDownloadURLs.current.clear();
    };
  }, []);
  const downloadableAssets =
    photo?.assets.filter(
      (a) => a.role === "original_image" || a.role === "live_video",
    ) || [];
  const savePopupAsset = downloadableAssets.find((a) => a.id === savePopupAssetID);
  const downloadableIDs = downloadableAssets.map((a) => a.id).join(",");
  useEffect(() => {
    if (!downloadableIDs) return;
    let live = true;
    const refresh = async () => {
      try {
        const links = await Promise.all(
          downloadableAssets.map(
            async (asset) =>
              [
                asset.id,
                await client.request<{ url: string; filename: string }>(
                  `/v1/photos/${photoID}/original-download`,
                  { role: asset.role },
                ),
              ] as const,
          ),
        );
        if (live) setDownloadLinks(Object.fromEntries(links));
      } catch (e) {
        if (live) setError(errorText(e));
      }
    };
    void refresh();
    // R2 download grants expire after five minutes. Refresh while this dialog is open.
    const timer = window.setInterval(refresh, 240_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [client, photoID, downloadableIDs]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (!client.controller.signal.aborted) setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function edit(e: FormEvent) {
    e.preventDefault();
    await action(async () => {
      setPhoto(
        await client.request(
          `/v1/photos/${photoID}`,
          { title: title.trim() || null, captured_local: date || null, location_label: place.trim() || null },
          "PATCH",
        ),
      );
      setEditing(false);
      onChange();
    });
  }
  async function prepareShareFile(
    asset: Photo["assets"][number],
    link?: { url: string; filename: string },
  ): Promise<{ file: File; url: string }> {
    const cached = shareFiles[asset.id];
    const cachedURL = preparedDownloads[asset.id];
    if (cached && cachedURL) return { file: cached, url: cachedURL };
    const grant =
      link ||
      (await client.request<{ url: string; filename: string }>(
        `/v1/photos/${photoID}/original-download`,
        { role: asset.role },
      ));
    const response = await fetch(grant.url, {
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: client.controller.signal,
    });
    if (!response.ok) throw new Error("照片准备失败，请重试");
    const blob = await response.blob();
    const file = new File([blob], grant.filename, {
      type: asset.mime_type || blob.type,
    });
    const objectURL = URL.createObjectURL(file);
    localDownloadURLs.current.add(objectURL);
    setShareFiles((files) => ({ ...files, [asset.id]: file }));
    setPreparedDownloads((links) => ({ ...links, [asset.id]: objectURL }));
    return { file, url: objectURL };
  }
  async function openSavePopup(asset: Photo["assets"][number], link?: { url: string; filename: string }) {
    setError("");
    setNotice("");
    setShareBusy(asset.id);
    try {
      await prepareShareFile(asset, link);
      setSavePreviewFailed(false);
      savePopupOpen.current = true;
      setSavePopupAssetID(asset.id);
    } catch (error) {
      if (!client.controller.signal.aborted) setError(errorText(error));
    } finally {
      setShareBusy(null);
    }
  }
  async function saveToPhotos(asset: Photo["assets"][number], link?: { url: string; filename: string }) {
    setError("");
    setNotice("");
    setShareBusy(asset.id);
    try {
      const { file } = await prepareShareFile(asset, link);
      if (!navigator.canShare({ files: [file] })) {
        setUnshareableIDs((ids) => [...ids, asset.id]);
        setNotice(
          asset.role === "original_image"
            ? "此格式无法通过系统菜单保存。请长按弹窗中的图片选择“存储图像”，或下载原件到“文件”。"
            : "此视频格式无法通过系统菜单保存到照片，可下载到“文件”。",
        );
        return;
      }
      const retryText = savePopupOpen.current
        ? "文件已准备好，请再点一次“改用系统菜单保存”。"
        : "文件已准备好，请再点一次“保存视频到照片”。";
      if (navigator.userActivation?.isActive === false) {
        setNotice(retryText);
        return;
      }
      try {
        await navigator.share({ files: [file] });
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (name === "AbortError") return;
        if (name === "NotAllowedError") {
          setNotice(retryText);
          return;
        }
        throw error;
      }
    } catch (error) {
      if (!client.controller.signal.aborted) setError(errorText(error));
    } finally {
      setShareBusy(null);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="照片详情"
        aria-hidden={Boolean(savePopupAssetID)}
      >
        <button
          className="modal-close icon-button"
          aria-label="关闭照片"
          onClick={close}
        >
          <X size={23} />
        </button>
        <div className="detail-image"
          onTouchStart={(event) => { const touch = event.changedTouches[0]; touchStart.current = { x: touch.clientX, y: touch.clientY }; }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (!start || savePopupOpen.current) return;
            const touch = event.changedTouches[0];
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
            navigate(dx < 0 ? previousID : nextID);
          }}>
          {photo && (url || photo.assets.some((a) => a.role === "preview" && cachedImage(a.id))) ? (
            <PrivateImage
              assetID={photo.assets.find((a) => a.role === "preview")!.id}
              url={url}
              alt={photo?.title || "照片预览"}
              eager
              retry={load}
            />
          ) : (
            <div className="pending-image">
              <Images size={45} />
              <p>浏览图片尚未准备好</p>
              {photo?.original_status === "saved" && (
                <span>原件已安全保存，可下载或补传预览。</span>
              )}
            </div>
          )}
          {previousID && <button className="photo-swipe previous" type="button" aria-label="上一张照片" onClick={() => navigate(previousID)}><ChevronLeft size={24} /></button>}
          {nextID && <button className="photo-swipe next" type="button" aria-label="下一张照片" onClick={() => navigate(nextID)}><ChevronRight size={24} /></button>}
        </div>
        <div className="detail-info">
          <p className="eyebrow">A MOMENT TO KEEP</p>
          <h2>{photo?.title || "未命名照片"}</h2>
          {photo && (
            <>
              <div className="detail-meta">
                <p>
                  <CalendarDays size={17} />
                  {photo.captured_local
                    ? photo.captured_local.replace("T", " ").slice(0, 16)
                    : "拍摄时间未记录"}
                </p>
                <p>
                  <MapPin size={17} />
                  {photo.location_label ||
                    (photo.latitude != null
                      ? `${photo.latitude.toFixed(5)}, ${photo.longitude!.toFixed(5)}`
                      : "地点未记录")}
                </p>
              </div>
              <p className="private-note">
                {photo.is_shared ? <><UsersRound size={14} /> 家庭成员可见 · {photo.owner_name}</> : <><LockKeyhole size={14} /> 仅你自己可见</>}
              </p>
              <p className="live-note">
                {photo.live_status === "paired_unverified"
                  ? "配套视频已保存 · 手动组合，尚未验证Live配对"
                  : "仅静态部分"}
              </p>
              {editing ? (
                <form className="edit-form" onSubmit={edit}>
                  <label>标题<input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="给照片起个名字" /></label>
                  <label>
                    拍摄时间（当地时间）
                    <input
                      type="datetime-local"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                  <label>
                    地点
                    <input
                      value={place}
                      maxLength={120}
                      onChange={(e) => setPlace(e.target.value)}
                      placeholder="例如：海边"
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    保存信息
                  </button>
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => setEditing(false)}
                  >
                    取消
                  </button>
                </form>
              ) : (
                <div className="detail-actions">
                  {photo.is_shared && <button className={`feature-toggle ${photo.liked_by_me ? "selected" : ""}`} disabled={busy}
                    onClick={() => action(async () => {
                      setPhoto(await client.request(`/v1/photos/${photoID}/like`, { liked: !photo.liked_by_me }));
                      onChange();
                    })}>
                    <Heart size={19} fill={photo.liked_by_me ? "currentColor" : "none"}/>
                    {photo.liked_by_me ? "已点赞 · 已加入我的精选" : "点赞并加入我的精选"}
                    <span className="like-count">{photo.like_count || 0}</span>
                  </button>}
                  {photo.is_owner !== false && <button
                    className={`feature-toggle ${photo.is_featured ? "selected" : ""}`}
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        setPhoto(
                          await client.request(
                            `/v1/photos/${photoID}`,
                            { is_featured: !photo.is_featured },
                            "PATCH",
                          ),
                        );
                        onChange();
                      })
                    }
                  >
                    <Heart
                      size={19}
                      fill={photo.is_featured ? "currentColor" : "none"}
                    />
                    {photo.is_featured ? "已放入精选" : "放入精选"}
                  </button>}
                  {photo.is_owner !== false && <button
                    className="secondary"
                    onClick={() => setEditing(true)}
                  >
                    编辑标题、时间和地点
                  </button>}
                  {photo.is_owner !== false && <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => action(async () => {
                      setPhoto(await client.request(`/v1/photos/${photoID}/share`, { is_shared: !photo.is_shared }));
                      onChange();
                    })}
                  >
                    <UsersRound size={17} /> {photo.is_shared ? "移出共享相册" : "放入共享相册"}
                  </button>}
                  {isIOS && <>
                    {downloadableAssets.filter((asset) =>
                      asset.role === "original_image" ||
                      (typeof navigator.share === "function" &&
                        typeof navigator.canShare === "function" &&
                        !unshareableIDs.includes(asset.id)),
                    ).map((asset) => (
                      <button
                        className="primary"
                        key={`photos-${asset.id}`}
                        disabled={shareBusy !== null}
                        onClick={() => void (asset.role === "original_image"
                          ? openSavePopup(asset, downloadLinks[asset.id])
                          : saveToPhotos(asset, downloadLinks[asset.id]))}
                      >
                        <Download size={17} />
                        {shareBusy === asset.id
                          ? "正在准备文件…"
                          : asset.role === "live_video"
                            ? "保存视频到照片"
                            : "保存到照片"}
                        <small>{formatBytes(Number(asset.size_bytes))}</small>
                      </button>
                    ))}
                  </>}
                  {downloadableAssets.map((a) => {
                    const label =
                      a.role === "live_video"
                        ? isIOS ? "下载配套视频到文件" : "下载配套视频"
                        : isIOS ? "下载原件到文件" : "下载原件";
                    const link = downloadLinks[a.id];
                    const prepared = preparedDownloads[a.id];
                    if (link && needsLocalDownload && !prepared)
                      return (
                        <button
                          className="secondary"
                          key={a.id}
                          disabled={busy}
                          onClick={() =>
                            action(async () => {
                              const response = await fetch(link.url, {
                                cache: "no-store",
                                referrerPolicy: "no-referrer",
                                signal: client.controller.signal,
                              });
                              if (!response.ok)
                                throw new Error("原件下载准备失败，请重试");
                              const objectURL = URL.createObjectURL(
                                await response.blob(),
                              );
                              localDownloadURLs.current.add(objectURL);
                              setPreparedDownloads((links) => ({
                                ...links,
                                [a.id]: objectURL,
                              }));
                              setNotice("文件已准备好，请再次点击下载保存。");
                            })
                          }
                        >
                          <Download size={17} />
                          {label} · 准备下载
                          <small>{formatBytes(Number(a.size_bytes))}</small>
                        </button>
                      );
                    return link ? (
                      <a
                        className="secondary"
                        key={a.id}
                        href={prepared || link.url}
                        download={link.filename}
                        referrerPolicy="no-referrer"
                        onClick={() =>
                          setNotice(
                            "已打开原件下载。iPhone 可在下载列表或“文件”App 中查找。",
                          )
                        }
                      >
                        <Download size={17} />
                        {label}
                        <small>{formatBytes(Number(a.size_bytes))}</small>
                      </a>
                    ) : (
                      <button
                        className="secondary"
                        key={a.id}
                        disabled={busy}
                        onClick={() => {
                          setError("");
                          void client
                            .request<{ url: string; filename: string }>(
                              `/v1/photos/${photoID}/original-download`,
                              { role: a.role },
                            )
                            .then((r) =>
                              setDownloadLinks((links) => ({
                                ...links,
                                [a.id]: r,
                              })),
                            )
                            .catch((e) => setError(errorText(e)));
                        }}
                      >
                        <Download size={17} />
                        {label} · 准备链接
                        <small>{formatBytes(Number(a.size_bytes))}</small>
                      </button>
                    );
                  })}
                  {photo.is_owner !== false &&
                    <>
                      <button
                        className="secondary"
                        onClick={() => input.current?.click()}
                      >
                        <RefreshCw size={17} />
                        重新选择原件或JPEG，生成浏览图片
                      </button>
                      <input
                        ref={input}
                        type="file"
                        hidden
                        accept="image/*,.heic,.heif"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f)
                            action(async () => {
                              await addDerivatives(
                                client,
                                photoID,
                                f,
                                crypto.randomUUID(),
                                () => {},
                              );
                              await load();
                              onChange();
                            });
                          e.target.value = "";
                        }}
                      />
                    </>
                  }
                  {photo.is_owner !== false && !photo.assets.some((a) => a.role === "live_video") && (
                    <>
                      <button
                        className="secondary"
                        onClick={() => videoInput.current?.click()}
                      >
                        添加配套视频
                      </button>
                      <input
                        ref={videoInput}
                        type="file"
                        hidden
                        accept=".mov,.mp4"
                        onChange={(e) => {
                          setVideoFile(e.target.files?.[0] || null);
                          e.target.value = "";
                        }}
                      />
                      {videoFile && (
                        <div className="notice">
                          <p>
                            将 {videoFile.name}{" "}
                            与当前静态图手动组合，保存后标记“尚未验证配对”。
                          </p>
                          <button
                            disabled={busy}
                            className="quiet"
                            onClick={() =>
                              action(async () => {
                                await addLiveVideo(client, photoID, videoFile);
                                setVideoFile(null);
                                await load();
                                onChange();
                              })
                            }
                          >
                            确认组合并保存
                          </button>
                          <button
                            className="quiet"
                            onClick={() => setVideoFile(null)}
                          >
                            取消
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  {photo.is_owner !== false && <div className="danger-area">
                    {deleteConfirm ? (
                      <>
                        <p>
                          将这张照片移入最近删除？30 天内可以恢复，之后会自动清理。
                        </p>
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() =>
                            action(async () => {
                              await client.request(
                                `/v1/photos/${photoID}`,
                                undefined,
                                "DELETE",
                              );
                              onChange();
                              close();
                            })
                          }
                        >
                          移入最近删除
                        </button>
                        <button
                          className="quiet"
                          onClick={() => setDeleteConfirm(false)}
                        >
                          保留照片
                        </button>
                      </>
                    ) : (
                      <button
                        className="delete-button"
                        onClick={() => setDeleteConfirm(true)}
                      >
                        <Trash2 size={16} />
                        删除照片
                      </button>
                    )}
                  </div>}
                </div>
              )}
            </>
          )}
          {photo?.is_shared && <section className="photo-comments" aria-label="共享照片评论">
            <h3>家人的评论 <span>{comments.length}</span></h3>
            {comments.length ? <div className="comment-list">{comments.map((comment) =>
              <article className="comment" key={comment.id}>
                <div><strong>{comment.author_name}</strong><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString("zh-CN")}</time></div>
                <p>{comment.body}</p>
                {comment.can_delete && <button type="button" className="quiet" disabled={commentBusy} onClick={() => void deleteComment(comment.id)}>删除</button>}
              </article>)}</div> : <p className="comment-empty">还没有评论</p>}
            <form onSubmit={(event) => void addComment(event)}>
              <label htmlFor="new-comment">写评论</label>
              <textarea id="new-comment" value={commentText} maxLength={30} rows={2}
                onChange={(event) => setCommentText(event.target.value)} placeholder="最多 30 字" />
              <div><small>{Array.from(commentText).length}/30</small><button className="primary" disabled={commentBusy || !commentText.trim()}>发布评论</button></div>
            </form>
            {commentError && <p className="error" role="alert">{commentError}</p>}
          </section>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {notice && <p className="notice" role="status">{notice}</p>}
        </div>
      </section>
      {savePopupAsset && preparedDownloads[savePopupAsset.id] && (
        <div className="save-popup-backdrop" onClick={close}>
          <section
            className="save-popup"
            role="dialog"
            aria-modal="true"
            aria-label="保存到照片"
            onClick={(event) => event.stopPropagation()}
          >
            <button ref={savePopupClose} className="save-popup-close icon-button" aria-label="关闭保存弹窗" onClick={close}>
              <X size={22} />
            </button>
            <h3>保存到照片</h3>
            <p>长按图片，再选“存储图像”。</p>
            {!savePreviewFailed ? (
              <img
                src={preparedDownloads[savePopupAsset.id]}
                alt="长按以存储原图"
                onError={() => setSavePreviewFailed(true)}
              />
            ) : (
              <p className="save-preview-error">此格式无法预览，请使用系统菜单保存原件。</p>
            )}
            {typeof navigator.share === "function" &&
              typeof navigator.canShare === "function" &&
              !unshareableIDs.includes(savePopupAsset.id) && (
                <button
                  className="secondary"
                  disabled={shareBusy !== null}
                  onClick={() => void saveToPhotos(savePopupAsset, downloadLinks[savePopupAsset.id])}
                >
                  改用系统菜单保存
                </button>
              )}
            <button className="quiet" onClick={close}>关闭</button>
            {notice && <p className="notice" role="status">{notice}</p>}
            {error && <p className="error" role="alert">{error}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
interface Job {
  id: string;
  name: string;
  file?: File;
  video?: File;
  provenance: "browser_selected" | "file_imported";
  featured: boolean;
  shared: boolean;
  details: { title: string; date: string; place: string };
  state: "waiting" | "working" | "done" | "failed";
  message: string;
  progress: number;
}
function Upload({
  client,
  displayName,
  onChange,
}: {
  client: Client;
  displayName: string;
  onChange: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { title: string; date: string; place: string }>>({});
  const [previewURLs, setPreviewURLs] = useState<Record<number, string>>({});
  const [previewFailed, setPreviewFailed] = useState<number[]>([]);
  const selectionVersion = useRef(0);
  const [provenance, setProvenance] =
    useState<Job["provenance"]>("browser_selected");
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [featured, setFeatured] = useState(false);
  const [shared, setShared] = useState(false);
  const [concurrency, setConcurrency] = useState(2);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<UploadSession[]>([]);
  const [resumeBusy, setResumeBusy] = useState("");
  const active = useRef(0);
  const albumInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const resumeInput = useRef<HTMLInputElement>(null);
  const [resumeSession, setResumeSession] = useState<UploadSession | null>(
    null,
  );
  const pictures = files.filter((f) => !/\.(mov|mp4)$/i.test(f.name));
  const videos = files.filter((f) => /\.(mov|mp4)$/i.test(f.name));
  const pendingName = (file: File, index: number) => photoFilename(displayName, `待保存${String(index + 1).padStart(2, "0")}`, fileMime(file), file.name);
  useEffect(() => {
    const urls: Record<number, string> = {};
    pictures.forEach((file, index) => { urls[index] = URL.createObjectURL(file); });
    setPreviewURLs(urls);
    setPreviewFailed([]);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  async function loadPending() {
    const ids = journal(client);
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          return await client.request<UploadSession>(`/v1/uploads/${id}`);
        } catch {
          return null;
        }
      }),
    );
    if (!client.controller.signal.aborted)
      setPending(
        results.filter((s): s is UploadSession => !!s && s.state === "open"),
      );
  }
  useEffect(() => {
    loadPending();
  }, []);
  function choose(list: FileList | null, p: Job["provenance"]) {
    if (!list) return;
    if (list.length > 100) {
      setError("每次最多选择100个文件");
      return;
    }
    const selected = Array.from(list);
    const version = ++selectionVersion.current;
    setFiles(selected);
    setDrafts({});
    void Promise.all(selected.filter((file) => !/\.(mov|mp4)$/i.test(file.name)).map(readPhotoMetadata))
      .then((found) => {
        if (selectionVersion.current !== version) return;
        setDrafts(Object.fromEntries(found.map((meta, index) => [index, {
          title: "", date: meta.captured_local?.slice(0, 16) || "", place: meta.location_label || "",
        }])));
      });
    setPairs({});
    setProvenance(p);
    setError("");
  }
  function enqueue() {
    if (!pictures.length) {
      setError("请至少选择一张静态原件，视频需与静态图一起导入");
      return;
    }
    if (videos.some((v) => !pairs[v.name])) {
      setError("请为每个视频选择配套静态图");
      return;
    }
    if (new Set(Object.values(pairs)).size !== videos.length) {
      setError("每张静态图只能组合一个配套视频");
      return;
    }
    setJobs((old) => [
      ...old,
      ...pictures.map((file) => ({
        id: crypto.randomUUID(),
        name: pendingName(file, pictures.indexOf(file)),
        file,
        video: videos.find((v) => pairs[v.name] === file.name),
        provenance,
        featured,
        shared,
        details: drafts[pictures.indexOf(file)] || { title: "", date: "", place: "" },
        state: "waiting" as const,
        message: "等待上传",
        progress: 0,
      })),
    ]);
    setFiles([]);
    ++selectionVersion.current;
    setPairs({});
  }
  useEffect(() => {
    if (client.controller.signal.aborted) return;
    const waiting = jobs
      .filter((j) => j.state === "waiting")
      .slice(0, Math.max(0, concurrency - active.current));
    for (const job of waiting) {
      active.current++;
      setJobs((old) =>
        old.map((j) => (j.id === job.id ? { ...j, state: "working" } : j)),
      );
      const update = (message: string, progress: number) => {
        if (!client.controller.signal.aborted)
          setJobs((old) =>
            old.map((j) => (j.id === job.id ? { ...j, message, progress } : j)),
          );
      };
      uploadPhoto(
        client,
        job.file!,
        job.video,
        job.provenance,
        job.id,
        job.featured,
        job.shared,
        job.details,
        update,
        (session) => setJobs((old) => old.map((item) => item.id === job.id ? { ...item, name: session.items.find((asset) => asset.role === "original_image")!.original_filename } : item)),
      )
        .then(() => {
          if (!client.controller.signal.aborted) {
            setJobs((old) =>
              old.map((j) =>
                j.id === job.id
                  ? {
                      ...j,
                      state: "done",
                      file: undefined,
                      video: undefined,
                      message: job.shared ? "已保存到共享相册" : "原件与浏览图片已保存",
                      progress: 1,
                    }
                  : j,
              ),
            );
            onChange();
          }
        })
        .catch((e) => {
          if (!client.controller.signal.aborted)
            setJobs((old) =>
              old.map((j) =>
                j.id === job.id
                  ? { ...j, state: "failed", message: errorText(e) }
                  : j,
              ),
            );
        })
        .finally(() => {
          active.current--;
          if (!client.controller.signal.aborted) {
            setJobs((old) => [...old]);
            loadPending();
          }
        });
    }
  }, [jobs, concurrency]);
  async function restore(list: FileList | null) {
    const s = resumeSession;
    if (!list || !s) return;
    setResumeBusy(s.id);
    setError("");
    try {
      await resume(client, s, Array.from(list), () => {});
      await loadPending();
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setResumeBusy("");
      setResumeSession(null);
    }
  }
  return (
    <section className={`upload-page${files.length ? " has-selection" : ""}`}>
      {!files.length && <p className="eyebrow">上传照片</p>}
      <h1>{files.length ? "确认照片" : "上传照片"}</h1>
      {!files.length && <p className="intro">可在保存前编辑标题、拍摄时间和地点。</p>}
      <div className="upload-panel">
        <div className="upload-icon">
          <CloudUpload size={35} />
        </div>
        <h2>你的下一张回忆</h2>
        <p>
          支持 JPEG、PNG、HEIC / HEIF
          <br />
          原件完整保留，浏览图片单独生成。
        </p>
        <div className="upload-options">
          <button
            className="primary"
            onClick={() => albumInput.current?.click()}
          >
            <Images size={18} />
            {files.length ? "重新选择" : "从相册选择"}
          </button>
          <button
            className="secondary"
            onClick={() => importInput.current?.click()}
          >
            <FolderOpen size={18} />
            {files.length ? "导入原件" : "导入原件文件 / Live素材"}
          </button>
        </div>
        <input
          ref={albumInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            choose(e.target.files, "browser_selected");
            e.target.value = "";
          }}
        />
        <input
          ref={importInput}
          type="file"
          accept=".jpg,.jpeg,.png,.heic,.heif,.hif,.mov,.mp4"
          multiple
          hidden
          onChange={(e) => {
            choose(e.target.files, "file_imported");
            e.target.value = "";
          }}
        />
        <p className="upload-hint">
          相册选择可能转换格式；严格保留源文件请使用“导入原件文件”。
          <br />
          Live素材需静态图和配套视频一起导入；当前只保存，不播放。
        </p>
      </div>
      {files.length > 0 && (
        <div className="selection-panel">
          <h3>
            已选择 {pictures.length} 张照片
            {videos.length ? ` + ${videos.length} 个配套视频` : ""}
          </h3>
          <div className="selected-files upload-previews">
            {pictures.map((f, i) => (
              <div className="upload-preview-card" key={i}>
                {previewURLs[i] && !previewFailed.includes(i) ?
                  <img src={previewURLs[i]} alt={`待上传预览 ${f.name}`} onError={() => setPreviewFailed((current) => [...current, i])}/> :
                  <div className="upload-preview-fallback"><Images size={25}/><span>当前格式暂不支持预览，仍可上传原件</span></div>}
                <div className="upload-preview-meta"><strong>{pendingName(f, i)}</strong><small>{formatBytes(f.size)}</small></div>
                <div className="upload-preview-fields">
                  <label>标题<input maxLength={80} value={drafts[i]?.title || ""} onChange={(event) => setDrafts((current) => ({ ...current, [i]: { ...(current[i] || { title: "", date: "", place: "" }), title: event.target.value } }))} placeholder="给这张照片起个名字"/></label>
                  <label>拍摄时间<span className="upload-date-control"><input type="datetime-local" value={drafts[i]?.date || ""} onChange={(event) => setDrafts((current) => ({ ...current, [i]: { ...(current[i] || { title: "", date: "", place: "" }), date: event.target.value } }))}/></span></label>
                  <label>地点<input maxLength={120} value={drafts[i]?.place || ""} onChange={(event) => setDrafts((current) => ({ ...current, [i]: { ...(current[i] || { title: "", date: "", place: "" }), place: event.target.value } }))}/></label>
                </div>
              </div>
            ))}
          </div>
          {videos.map((v, i) => (
            <label key={i} className="pairing">
              {v.name}
              <select
                aria-label={`${v.name} 的配套静态图`}
                value={pairs[v.name] || ""}
                onChange={(e) =>
                  setPairs({ ...pairs, [v.name]: e.target.value })
                }
              >
                <option value="">选择配套静态图（手动组合）</option>
                {pictures.map((p, i) => (
                  <option key={i} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
            />
            上传后放入精选
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
            />
            上传后放入共享相册
          </label>
          <div className="selection-actions">
            <button className="primary" onClick={enqueue}>
              开始保存
              <ArrowUpRight size={17} />
            </button>
            <button className="quiet" onClick={() => { ++selectionVersion.current; setFiles([]); }}>
              取消选择
            </button>
          </div>
        </div>
      )}
      <div className="upload-settings">
        <span>
          同时上传
          <select
            aria-label="同时上传数量"
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
          >
            <option value={2}>2 张</option>
            <option value={1}>1 张（省内存）</option>
          </select>
        </span>
        <span>锁屏或关闭页面可能中断，请保持页面打开。</span>
      </div>
      {error && (
        <p className="error notice" role="alert">
          {error}
        </p>
      )}
      {jobs.length > 0 && (
        <div className="upload-queue">
          <h3>上传记录</h3>
          {jobs.map((j) => (
            <div className={`queue-item ${j.state}`} key={j.id}>
              <span className="queue-icon">
                {j.state === "done" ? (
                  <Check size={19} />
                ) : (
                  <Images size={19} />
                )}
              </span>
              <div>
                <strong>{j.name}</strong>
                <p>{j.message}</p>
                {j.state === "working" && (
                  <progress max={1} value={j.progress} />
                )}
              </div>
              {j.state === "failed" && (
                <button
                  className="quiet"
                  onClick={() =>
                    setJobs((old) =>
                      old.map((x) =>
                        x.id === j.id ? { ...x, state: "waiting" } : x,
                      ),
                    )
                  }
                >
                  重试
                </button>
              )}
              {j.state === "done" && <Heart size={16} />}
            </div>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <div className="resume-panel">
          <h3>可恢复的上传</h3>
          <p>页面中断后，请重新选择相同原文件；后台会核验已保存部分。</p>
          {pending.map((s) => (
            <div className="resume-item" key={s.id}>
              <span>
                {s.items
                  .filter((i) => i.state === "pending")
                  .map((i) => i.original_filename)
                  .join("、")}
              </span>
              <button
                className="quiet"
                disabled={!!resumeBusy}
                onClick={() => {
                  setResumeSession(s);
                  resumeInput.current?.click();
                }}
              >
                {resumeBusy === s.id ? "核验中…" : "重新选择并继续"}
              </button>
              <button
                className="quiet"
                disabled={!!resumeBusy}
                onClick={async () => {
                  try {
                    await cancel(client, s.id);
                    loadPending();
                    onChange();
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                取消剩余上传
              </button>
            </div>
          ))}
          <input
            hidden
            ref={resumeInput}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.heic,.heif,.mov,.mp4"
            onChange={(e) => {
              restore(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </section>
  );
}
async function avatarFromFile(file: File): Promise<string> {
  if (file.size > 10_000_000 || !file.type.startsWith("image/"))
    throw new Error("请选择不超过 10 MB 的图片");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    for (const size of [256, 192, 128]) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法处理头像");
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      const data = canvas.toDataURL("image/jpeg", 0.72);
      if (data.length <= 90000) return data;
    }
    throw new Error("头像图片过大，请换一张");
  } finally {
    URL.revokeObjectURL(source);
  }
}
function MyPage({ me, client, onChange, logout }: { me: any; client: Client; onChange: () => void; logout: () => Promise<void> }) {
  const preload = usePwaCacheStatus();
  const ratio = (me.committed_bytes + me.reserved_bytes) / me.budget_bytes;
  const [name, setName] = useState(me.display_name as string);
  const [avatar, setAvatar] = useState<string | null>(me.avatar_data_url || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  function startEditing() {
    setName(me.display_name);
    setAvatar(me.avatar_data_url || null);
    setError("");
    setSaved(false);
    setEditingProfile(true);
  }
  function cancelEditing() {
    setError("");
    setEditingProfile(false);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await client.request("/v1/me", { display_name: name.trim(), avatar_data_url: avatar }, "PATCH");
      onChange();
      setSaved(true);
      setEditingProfile(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="my-page">
      <h1>我的资料</h1>
      <div className="my-profile">
        <Avatar name={me.display_name} image={me.avatar_data_url} large />
        <div>
          <h2>{me.display_name}</h2>
        </div>
        {!editingProfile && <button type="button" className="secondary profile-settings" onClick={startEditing}>设置资料</button>}
      </div>
      {editingProfile && <form className="profile-edit" onSubmit={save}>
        <Avatar name={name || me.display_name} image={avatar} large />
        <div className="profile-fields">
          <label>显示昵称
            <input value={name} maxLength={40} required onChange={(e) => { setName(e.target.value); setSaved(false); }} />
          </label>
          <input ref={avatarInput} type="file" accept="image/*" hidden onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError("");
            try { setAvatar(await avatarFromFile(file)); setSaved(false); }
            catch (error) { setError(errorText(error)); }
          }} />
          <div className="profile-actions">
            <button type="button" className="secondary" onClick={() => avatarInput.current?.click()}>更换头像</button>
            {avatar && <button type="button" className="quiet" onClick={() => { setAvatar(null); setSaved(false); }}>移除头像</button>}
            <button className="primary" disabled={busy}>{busy ? "保存中…" : "保存资料"}</button>
            <button type="button" className="quiet" disabled={busy} onClick={cancelEditing}>取消</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </form>}
      {saved && <p className="notice" role="status">资料已保存</p>}
      <div className="stats-grid">
        <div>
          <span>我的照片</span>
          <strong>
            {me.photo_count}
            <small>张</small>
          </strong>
        </div>
        <div>
          <span>我的文件占用</span>
          <strong>{formatBytes(me.personal_bytes)}</strong>
        </div>
      </div>
      <div className="storage-panel">
        <h3>
          家庭相册容量
          <span>
            {formatBytes(me.committed_bytes + me.reserved_bytes)} /{" "}
            {formatBytes(me.budget_bytes)}
          </span>
        </h3>
        <progress max={1} value={ratio} />
        <p>
          {ratio >= 1
            ? "容量已达预算，仍可浏览、下载和删除。"
            : me.committed_bytes + me.reserved_bytes >= me.warning_bytes
              ? "容量接近预算，请联系管理员或清理文件。"
              : "空间充足，继续收藏喜欢的日常。"}
          {me.reserved_bytes > 0 &&
            ` 待完成或待清理预留 ${formatBytes(me.reserved_bytes)}。`}
        </p>
      </div>
      <a className="secondary trash-link" href="#/trash"><Trash2 size={17} /> 最近删除 <ChevronRight size={17} /></a>
      {!localDemo && (
        <div className="storage-panel pwa-storage-panel">
          <h3>
            本机程序资源
            <span>
              {preload.state === "ready"
                ? "已预装"
                : preload.total
                  ? `${preload.completed}/${preload.total}`
                  : "正在检查"}
            </span>
          </h3>
          {preload.total > 0 && (
            <progress max={preload.total} value={preload.completed} />
          )}
          <p>字体、影集模板、PDF 与图片处理工具保存在本机，后续打开复用。照片和音乐内容仍需联网。</p>
          {preload.downloads?.map((item, index) => (
            <div className="pwa-download" key={`${item.label}-${index}`}>
              <div><span>{item.label}</span><span>{formatBytes(item.loaded)}{item.total > 0 && ` / ${formatBytes(item.total)}`}</span></div>
              {item.total > 0 && <progress max={item.total} value={Math.min(item.loaded, item.total)} />}
            </div>
          ))}
          {preload.state === "partial" && (
            <>
              <p role="status">{preload.storage ? "手机暂时无法保存剩余资源，请释放一些空间后重试。" : "部分资源未完成，联网时会自动重试。已完成的资源会保留。"}</p>
              <button type="button" className="secondary" onClick={requestPwaPreload}>重试剩余资源</button>
            </>
          )}
        </div>
      )}
      <p className="fineprint">最近删除保留 30 天。重要照片仍建议另外备份一份原件。</p>
      <button className="secondary logout" onClick={logout}>
        <LogOut size={17} />
        退出登录
      </button>
    </section>
  );
}
