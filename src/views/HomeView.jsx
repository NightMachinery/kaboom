import { useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { toast } from "react-hot-toast";
import { BsBook, BsCassetteFill } from "react-icons/bs";
import { TbCardsFilled } from "react-icons/tb";
import { IoPersonCircleOutline } from "react-icons/io5";
import Avatar, { genConfig } from "react-nice-avatar-vite-prod-fork";

import { PageContext } from "../components/PageContextProvider";
import { createRoom, joinRoom } from "../lib/api";
import { getGuestName, getGuestToken, getRoomSession, setGuestName, setRoomSession } from "../lib/session";

function normalizeCode(value) {
  return String(value || "")
    .replace(/[^a-z]/gi, "")
    .toUpperCase()
    .slice(0, 4);
}

function redirectPathFor(code, phase) {
  return phase === "lobby" ? `/lobby/${code}` : `/game/${code}`;
}

function HomeView() {
  const navigate = useNavigate();
  const { setPrompt } = useContext(PageContext);
  const [searchParams] = useSearchParams();
  const [roomCode, setRoomCode] = useState(() => normalizeCode(searchParams.get("c") || ""));
  const [displayName, setDisplayNameState] = useState(() => getGuestName());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const codeFromURL = normalizeCode(searchParams.get("c") || "");
    if (codeFromURL) setRoomCode(codeFromURL);
  }, [searchParams]);

  const avatarConfig = useMemo(() => genConfig(displayName || "Kaboom"), [displayName]);

  function persistName(nextName) {
    setDisplayNameState(nextName);
    setGuestName(nextName);
  }

  function promptForName(onSave) {
    setPrompt({
      element: (
        <NamePrompt
          initialValue={displayName}
          onSave={(value) => {
            persistName(value);
            setPrompt(null);
            onSave?.(value);
          }}
        />
      ),
      noCancel: false,
    });
  }

  async function ensureNameAndRun(action) {
    const name = displayName.trim();
    if (!name) {
      promptForName((savedName) => action(savedName));
      return;
    }
    await action(name);
  }

  async function handleCreate() {
    await ensureNameAndRun(async (name) => {
      setLoading(true);
      try {
        const response = await createRoom({ guestToken: getGuestToken(), displayName: name });
        setRoomSession(response.code, response.roomSessionToken);
        navigate(redirectPathFor(response.code, response.phase));
      } catch (error) {
        toast.error(error?.message || "Failed to create room");
      } finally {
        setLoading(false);
      }
    });
  }

  async function handleJoin() {
    const code = normalizeCode(roomCode);
    if (code.length !== 4) {
      toast.error("Room code must be 4 letters");
      return;
    }

    await ensureNameAndRun(async (name) => {
      setLoading(true);
      try {
        const response = await joinRoom(code, {
          guestToken: getGuestToken(),
          displayName: name,
          roomSessionToken: getRoomSession(code),
        });
        setRoomSession(response.code, response.roomSessionToken);
        navigate(redirectPathFor(response.code, response.phase));
      } catch (error) {
        if (error?.message === "game_started") {
          toast.error("That game already started. Use a migrate-device link or re-open on the original device.");
        } else {
          toast.error(error?.message || "Failed to join room");
        }
      } finally {
        setLoading(false);
      }
    });
  }

  return (
    <div className="flex flex-col justify-start items-center scrollbar-hide h-full w-full gap-6 overflow-y-scroll overflow-x-hidden pb-24">
      <Helmet>
        <title>Kaboom</title>
        <meta name="description" content="Self-hosted Kaboom for intranet play." />
      </Helmet>

      <div className="text-title font-bold text-3xl sm:text-4xl md:text-6xl my-4 pt-6 text-primary relative w-full max-w-3xl flex items-center justify-center px-4">
        <div className="flex flex-col items-center relative text-center">
          KABOOM
          <span className="text-neutral text-normal text-xs sm:text-sm font-light">Self-hosted party game for local play</span>
        </div>
      </div>

      <div className="w-full max-w-3xl px-4 flex flex-col gap-4">
        <section className="rounded-2xl bg-neutral text-neutral-content p-4 md:p-6 flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-base-100 w-16 h-16 flex items-center justify-center overflow-hidden shrink-0">
              {displayName ? (
                <Avatar className="w-full h-full" {...avatarConfig} />
              ) : (
                <IoPersonCircleOutline className="text-4xl text-primary" />
              )}
            </div>
            <div className="min-w-0 grow">
              <div className="text-xs uppercase tracking-wide opacity-70">Display name</div>
              <div className="text-title text-2xl truncate">{displayName || "Set your name"}</div>
            </div>
            <button type="button" onClick={() => promptForName()} className="btn btn-secondary noskew shrink-0">
              {displayName ? "Change" : "Set name"}
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] items-end">
            <label className="flex flex-col gap-2">
              <span className="text-title text-xl">Join game</span>
              <input
                autoComplete="off"
                value={roomCode}
                onChange={(event) => setRoomCode(normalizeCode(event.target.value))}
                className="input skew-reverse text-center font-extrabold text-xl text-normal tracking-widest text-black w-full bg-accent-content"
                placeholder="A B C D"
                maxLength={4}
              />
            </label>
            <button type="button" disabled={loading} onClick={handleJoin} className="btn btn-secondary noskew w-full md:w-40">
              {loading ? <span className="loading loading-spinner" /> : "Join"}
            </button>
          </div>

          <div className="mx-auto max-w-sm py-[0.05rem] bg-neutral-content w-full rounded-full" />

          <button type="button" disabled={loading} onClick={handleCreate} className="btn btn-primary noskew w-full">
            {loading ? <span className="loading loading-spinner" /> : "Create game"}
          </button>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link className="btn bg-[#c342ff] border-none text-white noskew" to="/cards">
            <TbCardsFilled className="mr-2" /> Cards
          </Link>
          <a className="btn bg-[#27d62a] border-none text-white noskew" href="/TwoRooms_Rulebook_v3.pdf" target="_blank" rel="noreferrer">
            <BsBook className="mr-2" /> Rules
          </a>
          <button type="button" className="btn bg-[#0019fd] border-none text-white noskew" onClick={() => promptForName()}>
            <BsCassetteFill className="mr-2" /> Identity
          </button>
        </section>

        <section className="rounded-2xl border-2 border-neutral/20 p-4 bg-base-100 text-sm leading-6">
          <h2 className="text-title text-2xl mb-2">Self-hosted notes</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Everything runs locally on your server: no OAuth, analytics, captcha, or cloud playset service.</li>
            <li>Copy/migrate links stay room-scoped and work on plain HTTP.</li>
            <li>Remote Party Mode is enabled by default for new games.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function NamePrompt({ initialValue = "", onSave }) {
  const { setPrompt } = useContext(PageContext);
  const [name, setName] = useState(initialValue);
  const avatarConfig = useMemo(() => genConfig(name || "Kaboom"), [name]);

  function submit() {
    const value = String(name || "").trim();
    if (!value) return;
    onSave?.(value);
  }

  return (
    <div className="w-full flex flex-col justify-start items-center gap-4">
      <div className="w-16 h-16 rounded-full overflow-hidden bg-base-100">
        <Avatar className="w-full h-full" {...avatarConfig} />
      </div>
      <input
        autoFocus
        type="text"
        value={name}
        maxLength={40}
        placeholder="Name"
        className="skew input text-center font-extrabold text-xl text-normal text-accent-content w-full max-w-xs bg-neutral"
        onChange={(event) => setName(event.target.value.trimStart())}
      />
      <div className="flex justify-end items-center w-full gap-2">
        <button onClick={() => setPrompt(null)} className="btn btn-ghost noskew">Cancel</button>
        <button className="btn btn-primary noskew" onClick={submit}>Save</button>
      </div>
    </div>
  );
}

export default HomeView;
