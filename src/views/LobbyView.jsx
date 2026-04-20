import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { HiQrCode, HiUsers } from "react-icons/hi2";
import { IoPersonRemoveSharp } from "react-icons/io5";
import { BiError } from "react-icons/bi";
import { FaBomb, FaLink } from "react-icons/fa";

import { PageContext } from "../components/PageContextProvider";
import { PlayerRow } from "../components/PlayerList";
import RoundConfig from "../components/RoundConfig";
import Controls from "../components/info/Controls";
import QRCodeMenu from "../components/menus/QRCodeMenu";
import PlaysetPicker from "../components/selfhost/PlaysetPicker";
import useRoomConnection from "../hooks/useRoomConnection";
import { getPlaysetById, maximizePlayset } from "../helpers/playsets";
import { calculatePlaysetDisabled, recommendBuryFor } from "../lib/room-utils";
import {
  buildCurrentRoomMigrationLink,
  copyText,
  getLastCustomRounds,
  getLastPlaysetID,
  getLastRoundTab,
  setLastCustomRounds,
  setLastPlaysetID,
  setLastRoundTab,
} from "../lib/session";

const ROUND_TABS = [
  { name: "Recommended", value: "recommended", color: "#0019fd" },
  { name: "Custom", value: "custom", color: "#27d62a" },
];

function LobbyView() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { setPageCover, setMenu } = useContext(PageContext);
  const { status, roomState, error, sessionToken, connected, send } = useRoomConnection(code);
  const [playset, setPlayset] = useState(null);

  useEffect(() => {
    async function loadPlayset() {
      const resolved = await getPlaysetById(roomState?.playsetId || getLastPlaysetID());
      setPlayset(maximizePlayset(resolved));
    }
    loadPlayset();
  }, [roomState?.playsetId]);

  useEffect(() => {
    if (roomState?.phase && roomState.phase !== "lobby") {
      navigate(`/game/${String(code || "").toUpperCase()}`, { replace: true });
    }
  }, [code, navigate, roomState?.phase]);

  useEffect(() => {
    if (error === "room_not_found") navigate("/", { replace: true });
  }, [error, navigate]);

  const me = useMemo(() => roomState?.players?.find((player) => player.id === roomState?.meId) || null, [roomState]);
  const playerCount = roomState?.players?.length || 0;
  const wrongPlayerNumber = useMemo(() => calculatePlaysetDisabled(playset, playerCount), [playset, playerCount]);
  const recommendBury = useMemo(() => recommendBuryFor(playset, playerCount), [playset, playerCount]);
  const selectedRoundTab = roomState?.selectedRoundTab || getLastRoundTab();
  const startReady = useMemo(() => {
    if (!roomState?.players?.length) return false;
    if (roomState.players.length < 3) return false;
    return roomState.players.every((player) => player.host || player.ready);
  }, [roomState]);

  const sendSafe = useCallback(
    (type, payload) => {
      try {
        send(type, payload);
      } catch (err) {
        toast.error("Connection is not ready yet");
      }
    },
    [send]
  );

  const openQRCode = useCallback(() => {
    setMenu(<QRCodeMenu href={window.location.href} code={String(code || "").toUpperCase()} />);
  }, [code, setMenu]);

  const copyMigrateLink = useCallback(async () => {
    if (!sessionToken) return;
    try {
      await copyText(buildCurrentRoomMigrationLink(sessionToken));
      toast.success("Migrate-device link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  }, [sessionToken]);

  const showPlaysets = useCallback(() => {
    setPageCover({
      title: "Playsets",
      element: (
        <PlaysetPicker
          selectedPlaysetId={roomState?.playsetId}
          onSelect={(playsetId) => {
            setLastPlaysetID(playsetId);
            setPageCover(null);
            sendSafe("select_playset", { playsetId });
          }}
        />
      ),
      onClose: () => setPageCover(null),
    });
  }, [roomState?.playsetId, sendSafe, setPageCover]);

  if (status === "loading" || !roomState || !playset) {
    return <div className="w-full h-full flex items-center justify-center"><span className="loading loading-spinner" /></div>;
  }

  return (
    <div className="flex flex-col justify-start items-center w-full pb-24 h-full overflow-y-scroll scrollbar-hide">
      <Helmet>
        <title>Kaboom • Lobby • {String(code || "").toUpperCase()}</title>
      </Helmet>

      <div className="w-full max-w-3xl p-4 flex items-center justify-between text-title text-2xl font-extrabold">
        <Link to="/" className="flex items-center gap-3 text-primary"><FaBomb /><span>KABOOM</span></Link>
        <div className="flex items-center gap-3 text-secondary">
          <span>{String(code || "").toUpperCase()}</span>
          <button type="button" className="text-3xl" onClick={openQRCode}><HiQrCode /></button>
        </div>
      </div>

      <div className="w-full max-w-3xl px-4 flex flex-col gap-4">
        <section className="rounded-2xl bg-neutral text-neutral-content p-4 flex flex-col gap-3">
          <div className={`font-semibold flex items-center gap-2 ${connected ? "text-success" : "text-accent"}`}>
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${connected ? "bg-success" : "bg-accent"}`} />
            {connected ? "Connected" : "Reconnecting..."}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-secondary noskew w-full justify-center text-center" onClick={copyMigrateLink}>
              <FaLink className="mr-2" /> Migrate device
            </button>
            {!roomState.isHost ? (
              <button type="button" className={`btn noskew w-full justify-center text-center ${me?.ready ? "btn-success" : "btn-accent"}`} onClick={() => sendSafe("set_ready", { ready: !me?.ready })}>
                {me?.ready ? "Ready!" : "Ready up"}
              </button>
            ) : (
              <button type="button" className={`btn noskew w-full justify-center text-center ${startReady ? "btn-primary" : "btn-disabled"}`} onClick={() => sendSafe("start_game", {})}>
                Start game
              </button>
            )}
          </div>
          {wrongPlayerNumber && (
            <div className="text-error text-sm font-semibold flex items-center gap-2">
              <BiError />
              Player count does not match this playset.
            </div>
          )}
        </section>

        <section className="bg-neutral rounded-2xl text-neutral-content overflow-hidden">
          <div className="w-full p-4 flex flex-col gap-3">
            {roomState.players.map((player) => (
              <PlayerRow
                key={player.id}
                {...player}
                me={me}
                showId
                showOnline
                onClick={roomState.isHost && !player.host ? () => sendSafe("kick_player", { playerId: player.id }) : undefined}
                element={roomState.isHost && !player.host ? (
                  <div className="grow flex justify-end items-center">
                    <button className="clickable btn-ghost p-3 -mr-1 rounded-md skew" onClick={() => sendSafe("kick_player", { playerId: player.id })}>
                      <IoPersonRemoveSharp />
                    </button>
                  </div>
                ) : undefined}
              />
            ))}
          </div>
          <div className={`w-full bg-neutral text-center font-extrabold text-title pb-4 flex items-center justify-center gap-2 ${connected ? "text-neutral-content" : "text-accent"}`}>
            {playerCount} <HiUsers size={22} />
          </div>
        </section>

        <section className="rounded-2xl border-2 border-neutral/20 p-4 bg-base-100 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-title text-2xl">Selected playset</h2>
              <p className="text-sm opacity-70">Built-in playsets only in self-hosted mode.</p>
            </div>
            {roomState.isHost && <button type="button" className="btn btn-secondary noskew" onClick={showPlaysets}>Choose</button>}
          </div>

          <button type="button" className="w-full rounded-xl border-2 border-neutral/20 text-left p-4" onClick={roomState.isHost ? showPlaysets : undefined}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl" style={{ backgroundColor: `${playset.color || "#c342ff"}20`, color: playset.color || "#c342ff" }}>
                {playset.emoji || "🎲"}
              </div>
              <div className="grow min-w-0">
                <h3 className="text-title text-xl truncate">{playset.name}</h3>
                <p className="text-sm opacity-75">{playset.min_players === playset.max_players ? playset.min_players : `${playset.min_players}-${playset.max_players}`} players</p>
              </div>
            </div>
            {playset.description && <p className="text-sm mt-3 opacity-80">{playset.description}</p>}
          </button>

          <label className="flex items-center justify-between gap-3 border-2 border-neutral/20 rounded-xl p-3">
            <div>
              <div className="font-bold">Play with card burying</div>
              <div className="text-xs opacity-70">Recommended: {recommendBury ? "Yes" : "No"}</div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={roomState.playWithBury && !playset?.no_bury}
              disabled={!roomState.isHost || playset?.no_bury || playset?.force_bury}
              onChange={(event) => sendSafe("set_play_with_bury", { value: event.target.checked })}
            />
          </label>
        </section>

        <section className="rounded-2xl border-2 border-neutral/20 p-4 bg-base-100 flex flex-col gap-3">
          <h2 className="text-title text-2xl">Round options</h2>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {ROUND_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setLastRoundTab(tab.value);
                  if (tab.value === "recommended") {
                    sendSafe("set_round_tab", { value: "recommended" });
                  } else {
                    const customRounds = getLastCustomRounds() || roomState.roundConfig;
                    sendSafe("set_round_tab", { value: "custom" });
                    sendSafe("set_round_config", { rounds: customRounds });
                  }
                }}
                className={`px-4 py-2 rounded-full text-sm font-bold border-2 ${selectedRoundTab === tab.value ? "text-base-content" : "text-base-content/70 border-transparent"}`}
                style={{ borderColor: selectedRoundTab === tab.value ? tab.color : "transparent", backgroundColor: selectedRoundTab === tab.value ? `${tab.color}20` : "#00000010" }}
              >
                {tab.name}
              </button>
            ))}
          </div>
          <RoundConfig
            color={selectedRoundTab === "custom" ? "#27d62a" : "#0019fd"}
            roundConfig={roomState.roundConfig}
            onAddRound={
              roomState.isHost
                ? () => {
                    const lastRound = roomState.roundConfig[roomState.roundConfig.length - 1] || { time: 1, hostages: 1 };
                    const rounds = [...roomState.roundConfig, { time: Math.max(1, Math.ceil(lastRound.time / 2)), hostages: Math.max(1, Math.ceil(lastRound.hostages / 2)) }];
                    setLastRoundTab("custom");
                    setLastCustomRounds(rounds);
                    sendSafe("set_round_tab", { value: "custom" });
                    sendSafe("set_round_config", { rounds });
                  }
                : undefined
            }
            onRowDelete={
              roomState.isHost
                ? (index) => {
                    if (roomState.roundConfig.length <= 1) {
                      toast.error("You need at least one round");
                      return;
                    }
                    const rounds = roomState.roundConfig.filter((_, roundIndex) => roundIndex !== index);
                    setLastRoundTab("custom");
                    setLastCustomRounds(rounds);
                    sendSafe("set_round_tab", { value: "custom" });
                    sendSafe("set_round_config", { rounds });
                  }
                : undefined
            }
            onTimeChange={
              roomState.isHost
                ? (value, index) => {
                    const rounds = roomState.roundConfig.map((round, roundIndex) => (roundIndex === index ? { ...round, time: Number(value) } : round));
                    setLastRoundTab("custom");
                    setLastCustomRounds(rounds);
                    sendSafe("set_round_tab", { value: "custom" });
                    sendSafe("set_round_config", { rounds });
                  }
                : undefined
            }
            onHostagesChange={
              roomState.isHost
                ? (value, index) => {
                    const rounds = roomState.roundConfig.map((round, roundIndex) => (roundIndex === index ? { ...round, hostages: Number(value) } : round));
                    setLastRoundTab("custom");
                    setLastCustomRounds(rounds);
                    sendSafe("set_round_tab", { value: "custom" });
                    sendSafe("set_round_config", { rounds });
                  }
                : undefined
            }
          />
        </section>

        <section className="rounded-2xl border-2 border-neutral/20 p-4 bg-base-100">
          <h2 className="text-title text-2xl mb-3">Controls</h2>
          <div className="border-neutral border-2 text-base-content p-3 rounded-lg"><Controls /></div>
        </section>
      </div>
    </div>
  );
}

export default LobbyView;
