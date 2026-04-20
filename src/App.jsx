import { useCallback, useMemo, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import toast, { Toaster, ToastBar } from "react-hot-toast";

import PageContextProvider from "./components/PageContextProvider";
import Prompt from "./components/Prompt";
import Menu from "./components/Menu";
import Menu2 from "./components/Menu2";
import PageCover from "./components/PageCover";

import HomeView from "./views/HomeView";
import LobbyView from "./views/LobbyView";
import GameView from "./views/GameView";
import CardsView from "./views/CardsView";
import Privacy from "./views/Privacy";

function App() {
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState(null);
  const [menu, setMenu] = useState(null);
  const [menu2, setMenu2] = useState(null);
  const [pageCover, setPageCover] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  const smoothNavigate = useCallback((to) => navigate(to), [navigate]);
  const redirect = useCallback((to) => {
    window.location.href = to;
  }, []);

  const switchTheme = useCallback(
    (to) => {
      const next = to || (theme === "light" ? "dark" : "light");
      localStorage.setItem("theme", next);
      setTheme(next);
      document.getElementById("theme-att")?.setAttribute("data-theme", next);
    },
    [theme]
  );

  const promptApprove = useCallback(() => {
    prompt?.onApprove?.();
    setPrompt(null);
  }, [prompt]);

  const promptCancel = useCallback(() => {
    prompt?.onCancel?.();
    setPrompt(null);
  }, [prompt]);

  const connectionErrorPrompt = useCallback((message = "Connection lost. Reload?") => {
    setPrompt({ title: "Connection lost", text: message, onApprove: () => window.location.reload() });
  }, []);

  const contextValue = useMemo(
    () => ({
      user: null,
      setUser: () => {},
      getUser: async () => null,
      hasPermission: () => false,
      checkAuth: (fn) => {
        if (typeof fn === "function") fn();
        return true;
      },
      logout: () => {},
      smoothNavigate,
      redirect,
      allLocalStorage: () => Object.keys(localStorage).map((key) => ({ key, value: localStorage.getItem(key) })),
      theme,
      switchTheme,
      setPrompt,
      connectionErrorPrompt,
      menu,
      setMenu,
      menu2,
      setMenu2,
      showLoginMenu: () => toast("Self-hosted Kaboom uses local guest identities."),
      pageCover,
      setPageCover,
      devMode: false,
      setDevMode: () => {},
    }),
    [connectionErrorPrompt, menu, menu2, pageCover, redirect, setPrompt, smoothNavigate, switchTheme, theme]
  );

  return (
    <PageContextProvider value={contextValue}>
      <div className="App absolute inset-0 overflow-hidden scrollbar-hide">
        <Helmet>
          <meta charSet="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Kaboom</title>
          <meta name="title" content="Kaboom" />
          <meta name="description" content="Kaboom self-hosted intranet party game." />
          <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        </Helmet>

        <Toaster position="top-center" reverseOrder={false}>
          {(t) => (
            <ToastBar toast={t}>
              {({ icon, message }) => (
                <div className="w-full max-w-md flex items-center justify-center gap-2 text-center" onClick={() => toast.dismiss(t.id)}>
                  {icon}
                  {message}
                </div>
              )}
            </ToastBar>
          )}
        </Toaster>

        {pageCover && <PageCover {...pageCover} />}
        {prompt && <Prompt noCancel={prompt?.noCancel} onApprove={promptApprove} onCancel={promptCancel} title={prompt?.title} text={prompt?.text} element={prompt?.element} />}
        {menu2 && <Menu2 onCancel={() => setMenu2(null)}>{menu2}</Menu2>}
        {menu && <Menu onCancel={() => setMenu(null)}>{menu}</Menu>}

        <Routes>
          <Route path="/" element={<HomeView />} />
          <Route path="/lobby/:code" element={<LobbyView />} />
          <Route path="/game/:code" element={<GameView />} />
          <Route path="/cards" element={<CardsView />} />
          <Route path="/privacy" element={<Privacy />} />
        </Routes>
      </div>
    </PageContextProvider>
  );
}

export default App;
