import { useContext, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { TbNotification } from "react-icons/tb";

import { PageContext } from "../PageContextProvider";
import PlayerList from "../PlayerList";
import Controls from "../info/Controls";
import { getCardFromId } from "../../helpers/cards";
import { getPlaysetById, maximizePlayset } from "../../helpers/playsets";
import { CardFront } from "../Card";
import { buildCurrentRoomMigrationLink, copyText } from "../../lib/session";

function GameInfoMenu({ code, game, players, me, isHost, sessionToken, execute = () => {} }) {
  const { setPrompt } = useContext(PageContext);
  const [showControls, setShowControls] = useState(false);
  const [playWithColorReveal, setPlayWithColorReveal] = useState(game?.color_reveal);
  const [remoteMode, setRemoteMode] = useState(game?.remote_mode);
  const [playset, setPlayset] = useState(null);

  useEffect(() => {
    setPlayWithColorReveal(game?.color_reveal);
    setRemoteMode(game?.remote_mode);
  }, [game?.color_reveal, game?.remote_mode]);

  useEffect(() => {
    async function loadPlayset() {
      const resolved = await getPlaysetById(game?.playsetId);
      setPlayset(maximizePlayset(resolved));
    }
    loadPlayset();
  }, [game?.playsetId]);

  const cardsInGame = useMemo(
    () => (game?.cardsInGame || []).map((cardId) => getCardFromId(cardId)).filter(Boolean),
    [game?.cardsInGame]
  );

  async function copyMigrateLink() {
    if (!sessionToken) return;
    try {
      await copyText(buildCurrentRoomMigrationLink(sessionToken));
      toast.success("Migrate-device link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  }

  function pushNotif() {
    navigator.serviceWorker?.register?.("/sw.js");
    const card = getCardFromId(me?.card);
    if (!card || !Notification) return;
    Notification.requestPermission().then((permission) => {
      if (permission !== "granted") return;
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(card?.color?.title || "Kaboom", {
          tag: "KaboomCard",
          body: "Click to reveal card.",
          data: { ...card, color: { ...card.color, icon: undefined } },
        });
      });
    });
  }

  function changeColorReveal() {
    if (!isHost) return;
    setPlayWithColorReveal((value) => !value);
    execute("change-color-reveal", []);
  }

  function changeRemoteMode() {
    if (!isHost) return;
    execute("change-remote-mode", [!remoteMode]);
    setRemoteMode((value) => !value);
  }

  return (
    <div className="w-full h-full bg-base-100 overflow-hidden flex flex-col items-center">
      <div className="w-[100vw]" />
      <h1 className="text-title font-extrabold text-2xl py-4 text-secondary shadow-2xl shadow-base-100 bg-base-200 w-full text-center">{code}</h1>
      <div className="w-full h-full overflow-y-scroll overflow-x-hidden scrollbar-hide pt-3 pb-8">
        <div className="w-full px-4 flex flex-col gap-4">
          <div className="rounded-2xl border-2 border-neutral/20 p-4 bg-base-100">
            <h2 className="text-title text-xl">Playset</h2>
            {playset ? (
              <div className="mt-2">
                <div className="font-bold">{playset.name}</div>
                <p className="text-sm opacity-70">{playset.description}</p>
              </div>
            ) : (
              <span className="loading loading-spinner" />
            )}
          </div>

          <div className="pt-0 flex flex-col justify-start items-start w-full shrink bg-base-100">
            <h1 className="text-xl font-extrabold text-neutral uppercase">Cards in game</h1>
            {game?.buriedCard && <p className="-mt-1 text-xs font-light text-neutral">1 card is buried.</p>}
            <div className="flex gap-6 py-2 pb-4 overflow-x-scroll w-full scrollbar-hide">
              {cardsInGame.map((card) => (
                <div key={card.id} className="card relative scale-[20%] -m-28 -my-40"><CardFront card={card} color={card.color} /></div>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-start items-start w-full shrink bg-base-100 gap-2">
            <h1 className="text-xl font-extrabold text-neutral uppercase">Options</h1>
            {isHost && (
              <>
                <ToggleButton full recommended={players?.length > 10} checked={!!playWithColorReveal} onChange={changeColorReveal}>Color reveals</ToggleButton>
                <ToggleButton full recommended checked={!!remoteMode} onChange={changeRemoteMode} customText="Remotely reveal card & color" customTextClassName="text-secondary" toggleClassName="toggle-secondary">Remote Party Mode</ToggleButton>
              </>
            )}
            <button className="btn btn-neutral noskew w-full" onClick={pushNotif}><span className="skew pr-2 text-xl"><TbNotification /></span>Card notification</button>
            <button className="btn btn-secondary noskew w-full" onClick={copyMigrateLink}>Copy migrate-device link</button>
          </div>

          <div className="flex flex-col justify-start items-start w-full bg-base-100">
            <h1 className="text-xl font-extrabold text-neutral uppercase">Controls</h1>
            <div onClick={() => setShowControls((value) => !value)} className={`border-neutral border-2 text-base-content p-3 rounded-lg w-full transition-all overflow-y-scroll relative ${showControls ? "h-64" : "h-[3.3rem]"}`}>
              <div className="cursor-pointer underline">{showControls ? "Tap to hide" : "Show controls"}</div>
              {showControls && <Controls />}
            </div>
          </div>

          <div className="bg-neutral w-full h-fit border-neutral mt-2 rounded-xl overflow-hidden">
            <PlayerList players={players} me={me} showId showOnline={isHost} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToggleButton({ checked, onChange = () => {}, children, full, recommended, hideReccomended, customText, customTextClassName = "", toggleClassName = "toggle-primary", disabled }) {
  return (
    <label className={`w-full border-2 border-neutral rounded-xl p-3 flex items-center justify-between gap-3 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex flex-col text-left">
        <span className="font-bold">{children}</span>
        {(customText || (recommended && !hideReccomended)) && (
          <span className={`text-xs opacity-70 ${customTextClassName}`}>{customText || "Recommended"}</span>
        )}
      </div>
      <input type="checkbox" className={`toggle ${toggleClassName}`} checked={checked} disabled={disabled} onChange={onChange} />
    </label>
  );
}

export default GameInfoMenu;
