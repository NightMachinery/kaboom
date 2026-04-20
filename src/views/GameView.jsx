import "animate.css";
import "../game.css";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import moment from "moment";
import Avatar, { genConfig } from "react-nice-avatar-vite-prod-fork";
import { RxCardStack } from "react-icons/rx";
import { IoCloudOfflineOutline, IoColorPaletteSharp } from "react-icons/io5";
import { FiSend } from "react-icons/fi";
import { TbCards, TbPlayCard } from "react-icons/tb";
import { AiOutlineInfoCircle } from "react-icons/ai";
import { FaFlagCheckered, FaBomb, FaLink } from "react-icons/fa";
import { PiPersonSimpleRunBold } from "react-icons/pi";
import { BsFillDoorOpenFill } from "react-icons/bs";

import Countdown from "../components/Countdown";
import { PageContext } from "../components/PageContextProvider";
import Card, { CardFront } from "../components/Card";
import SendCardMenu from "../components/menus/SendCardMenu";
import GameInfoMenu from "../components/menus/GameInfoMenu";
import CardInfoMenu from "../components/menus/CardInfoMenu";
import PlayerSelectMenu from "../components/menus/PlayerSelectMenu";
import RoundInfoMenu from "../components/menus/RoundsInfoMenu";
import { SwapPropmt } from "../components/swapcards/SwapCards";
import { getCardColorFromColorName, getCardFromId } from "../helpers/cards";
import { interpolateColor } from "../helpers/color";
import useWindowDimensions from "../hooks/useWindowDimensions";
import useRoomConnection from "../hooks/useRoomConnection";
import { buildCurrentRoomMigrationLink, copyText } from "../lib/session";

const ROUND_NAMES = ["NOT YET A", "FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"];

function GameView() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { setMenu2, setMenu, setPrompt } = useContext(PageContext);
  const { status, roomState, error, connected, sessionToken, send } = useRoomConnection(code, {
    onEvent: (event) => {
      if (event?.event === "remote-color-reveal") {
        const payload = event.payload || {};
        const color = getCardColorFromColorName(payload.color_name);
        if (color && payload.from_player) {
          toast(<ColorRevealToast color={color} player={payload.from_player} />, {
            id: `color:${payload.from_player?.id}`,
            duration: 5000,
            position: "top-left",
            style: { backgroundColor: "transparent", padding: "0px", boxShadow: "none" },
            className: "p-0 -mx-3 bg-red-500 w-full max-w-md shadow-none drop-shadow-none",
          });
        }
      }
      if (event?.event === "remote-card-reveal") {
        const payload = event.payload || {};
        const card = getCardFromId(payload.card_id);
        if (card && payload.from_player) {
          toast(<CardRevealToast card={card} player={payload.from_player} />, {
            id: `card:${payload.from_player?.id}`,
            duration: 5000,
            position: "top-left",
            style: { backgroundColor: "transparent", padding: "0px", boxShadow: "none" },
            className: "p-0 -mx-3 bg-red-500 w-full max-w-md shadow-none drop-shadow-none",
          });
        }
      }
    },
  });
  const [screen, setScreen] = useState(null);
  const [countdown, setCountdown] = useState(300);

  const me = useMemo(() => roomState?.players?.find((player) => player.id === roomState?.meId) || null, [roomState]);
  const isHost = !!roomState?.isHost;

  useEffect(() => {
    setMenu(null);
    setMenu2(null);
    setPrompt(null);
  }, [setMenu, setMenu2, setPrompt]);

  useEffect(() => {
    if (roomState?.phase === "lobby") {
      navigate(`/lobby/${String(code || "").toUpperCase()}`, { replace: true });
    }
  }, [code, navigate, roomState?.phase]);

  useEffect(() => {
    if (error === "room_not_found") {
      navigate("/", { replace: true });
    }
  }, [error, navigate]);

  const execute = useCallback(
    (action, args = []) => {
      try {
        send("game_action", { action, args });
      } catch {
        toast.error("Connection is not ready yet");
      }
    },
    [send]
  );

  if (status === "loading" || !roomState?.game || !me) {
    return <div className="w-full h-full flex items-center justify-center"><span className="loading loading-spinner" /></div>;
  }

  return (
    <>
      {screen && <div className="animate__animated animate__fadeIn absolute inset-0 z-[90] flex flex-col items-center justify-center screen-bg overflow-hidden">{screen}</div>}
      <div className="flex flex-col justify-start items-start w-full h-full">
        <div className="overflow-visible w-full scrollbar-hide flex flex-col items-center h-full">
          <div className="flex flex-col justify-start items-center w-full h-full scrollbar-hide">
            <div className="flex flex-row justify-center items-center p-3 w-full relative h-[5.2rem]">
              {!connected ? (
                <div onClick={() => window.location.reload()} className="drop-shadow-sm clickable w-10 h-full absolute top-0 bottom-0 left-5 z-20 btn-base-100 flex items-center justify-center text-error text-3xl rounded-full unskew font-bold">
                  <IoCloudOfflineOutline />
                </div>
              ) : (
                <div className="absolute top-0 bottom-0 z-[100] h-full left-5 w-10 flex items-center justify-center drop-shadow-sm dropdown">
                  <div className="dropdown">
                    <label tabIndex={0}><Avatar className="rounded-full" style={{ height: "2.2rem", width: "2.2rem" }} {...genConfig(me?.name || me?.id || "a")} /></label>
                    <ul tabIndex={0} className="dropdown-content pt-2 absolute z-20">
                      <AvatarMenu code={code} sessionToken={sessionToken} isHost={isHost} me={me} execute={execute} />
                    </ul>
                  </div>
                </div>
              )}
              <div className="flex flex-col justify-center items-center absolute top-2 right-0 left-0 z-20">
                <Countdown s={countdown} paused={roomState?.game?.paused} onClick={() => setMenu2(<RoundInfoMenu game={roomState.game} />)} />
              </div>
              <div onClick={() => setMenu2(<GameInfoMenu me={me} code={String(code || "").toUpperCase()} sessionToken={sessionToken} isHost={isHost} game={roomState.game} players={roomState.players} execute={execute} />)} className="drop-shadow-sm clickable w-10 absolute top-0 bottom-0 h-full right-5 z-[100] btn-base-100 flex items-center justify-center text-neutral text-3xl rounded-full unskew font-bold">
                <TbCards />
              </div>
              <div className="absolute -bottom-4 left-2 right-0 text-title text-secondary/70 text-center text-lg font-extrabold flex items-center justify-center">
                <MiniRoundDisplay game={roomState.game} />
              </div>
            </div>

            <Game
              me={me}
              isHost={isHost}
              getPlayers={() => roomState.players || []}
              game={roomState.game}
              execute={execute}
              setScreen={setScreen}
              setCountdown={setCountdown}
              code={code}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function Game({ me, isHost, getPlayers = () => null, game, execute = () => {}, setScreen, setCountdown = () => {}, code }) {
  const [card, setCard] = useState(null);
  const [hideCard, setHideCard] = useState(true);
  const { setMenu, setMenu2, setPrompt } = useContext(PageContext);
  const round = useRef(game?.rounds?.[game?.round - 1 || 0]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!round?.current?.started_at || round?.current?.paused) return;
      const tsInt = parseInt(moment().format("X"), 10);
      const startedAtInt = parseInt(round?.current?.started_at, 10);
      const roundTime = round?.current?.time * 60;
      const endsAt = startedAtInt + roundTime + 3;
      const secondsLeft = endsAt - tsInt;

      if (secondsLeft <= 0) setCountdown(0);
      else if (secondsLeft >= roundTime) setCountdown(roundTime);
      else setCountdown(secondsLeft);
    }, 250);

    return () => clearInterval(interval);
  }, [setCountdown]);

  useEffect(() => {
    if (!me?.card) return;
    setCard(getCardFromId(me.card));
    round.current = { ...(game?.rounds?.[game?.round - 1 || 0] || { time: 3, hostages: 2, started_at: "12" }), paused: game.paused };
    getSwapRequests();
    gameHasUpdated();
  }, [me, game]);

  useEffect(() => {
    gameHasUpdated();
  }, [card]);

  function gameHasUpdated() {
    if (!game?.phase || !me?.startingRoom) return;
    setScreen(null);

    switch (game?.phase) {
      case "rooms":
        setScreen(<GoToRoomScreen roomNr={me?.startingRoom} onReady={() => execute("am-in-room", [me.id])} onForceReady={isHost ? () => execute("force-start-game", []) : undefined} />);
        break;
      case "rounds":
        if (game?.rounds?.filter((roundItem) => roundItem.started_at)?.length === game?.rounds?.filter((roundItem) => roundItem.ended)?.length) {
          announceRoundEnd();
        }
        updateCountdown(game);
        break;
      case "boom":
        if (game?.timeToReveal) {
          if (isHost) {
            setScreen(
              <RevealAllScreen
                card={card}
                buriedCard={getCardFromId(game?.buriedCard)}
                onLobby={() => execute("redirect-to-lobby", [])}
                onClose={() => execute("close-room", [])}
              />
            );
          } else {
            setScreen(<RevealAllScreen card={card} buriedCard={getCardFromId(game?.buriedCard)} />);
          }
        } else {
          const pauseGameCards = game.cardsInGame
            .map((cardId) => getCardFromId(cardId))
            .filter((gameCard) => gameCard?.id !== game.buriedCard && gameCard?.pausegamenr)
            .sort((a, b) => (a?.pausegamenr || 0) - (b?.pausegamenr || 0));

          const pauseGameCard = pauseGameCards[game.pauseGameIndex];
          const players = getPlayers();
          let player = players.find((entry) => entry.card === pauseGameCard?.id);
          if (!player) return;
          player = { ...player, avaConfig: genConfig(player.name || player.id || "a") };

          setPrompt(null);
          setMenu(null);
          setMenu2(null);
          setScreen(<PauseGameNumberScreen card={pauseGameCard} player={player} meId={me?.id} isHost={isHost} onClick={() => execute("next-pause-game-number", [me?.id])} />);
        }
        break;
      default:
        break;
    }
  }

  function announceRoundStart(roundName, roundNumber, totalRounds = 3) {
    setMenu(null);
    setMenu2(null);
    setScreen(<RoundStartScreen roundName={roundName} roundNumber={roundNumber} totalRounds={totalRounds} />);
    setTimeout(() => setScreen(null), 2700);
  }

  function announceRoundEnd() {
    setMenu(null);
    setMenu2(null);
    setHideCard(true);
    setScreen(<RoundEndScreen hostages={round.current?.hostages} onReady={() => execute("ready-for-next-round", [me?.id])} onForceReady={isHost ? () => execute("force-start-game", []) : undefined} />);
  }

  function getRoundName(gameState) {
    const total = gameState?.rounds?.length || 3;
    const current = gameState.round;
    if (current >= total) return "LAST";
    return ROUND_NAMES[current];
  }

  function updateCountdown(gameState) {
    if (!gameState || gameState?.paused) return;
    const tsInt = parseInt(moment().format("X"), 10);
    const currentRound = gameState?.rounds?.[gameState?.round - 1 || 0] || { time: 3, hostages: 2, started_at: "12" };
    if (currentRound?.paused) return;
    const roundTime = currentRound.time * 60;
    const startedAtInt = parseInt(currentRound.started_at, 10);
    const endsAt = startedAtInt + roundTime + 3;

    if (tsInt < startedAtInt + 3) announceRoundStart(getRoundName(gameState), gameState?.round, gameState?.rounds?.length);
    else if (tsInt >= endsAt) setCountdown(0);
  }

  function getPlayerFromId(id) {
    return (getPlayers() || [])
      .map((player) => ({ ...player, avaConfig: genConfig(player?.name || player?.id || "a") }))
      .find((player) => player.id === id);
  }

  const showSendCard = useCallback(
    (currentCard) => {
      const players = getPlayers() || [];
      setMenu(
        <SendCardMenu
          card={currentCard}
          me={me}
          players={players.filter((player) => player.id !== me.id)}
          lastRound={game.rounds.length === game.round}
          getSoberCard={() => {
            execute("get-sober-card", [me?.id]);
            setMenu(null);
            setMenu2(null);
          }}
          onClick={(id) => {
            execute("request-swap-card", [me?.id, id]);
            setMenu(null);
            setMenu2(null);
          }}
        />
      );
    },
    [execute, game, getPlayers, me, setMenu, setMenu2]
  );

  function onRemoteCardReveal() {
    const players = getPlayers();
    if (!players) return;
    setMenu(
      <PlayerSelectMenu
        color={card?.color?.primary || "#0019fd"}
        players={players.filter((player) => player.id !== me.id)}
        onSelect={(playerIdArray) => {
          setMenu(null);
          if (playerIdArray.length > 0) {
            toast.success("Card revealed");
            execute("do-remote-card-reveal", [playerIdArray, { id: card?.id }, me]);
          }
        }}
        buttonText={<>REVEAL <FiSend className="-rotate-45 ml-2 noskew" /></>}
        titleElement={<div className="w-full flex items-center justify-start text-title text-base-content"><TbPlayCard size={28} className="mr-2" /> CARD REVEAL</div>}
      />
    );
  }

  function onRemoteColorReveal() {
    const players = getPlayers();
    if (!players) return;
    setMenu(
      <PlayerSelectMenu
        color={card?.color?.primary || "#0019fd"}
        players={players.filter((player) => player.id !== me.id)}
        onSelect={(playerIdArray) => {
          setMenu(null);
          if (playerIdArray.length > 0) {
            toast.success("Color revealed");
            execute("do-remote-color-reveal", [playerIdArray, card?.color_name, me]);
          }
        }}
        buttonText={<>REVEAL <FiSend className="-rotate-45 ml-2 noskew" /></>}
        titleElement={<div className="w-full flex items-center justify-start text-title text-base-content"><IoColorPaletteSharp size={28} className="mr-2" /> COLOR REVEAL</div>}
      />
    );
  }

  function getSwapRequests() {
    const request = game?.swapRequests?.find((entry) => entry.initId === me?.id || entry.withId === me?.id);
    if (!request) return setPrompt(null);
    const initPlayer = getPlayerFromId(request.initId);
    const withPlayer = getPlayerFromId(request.withId);
    if (request.initId === me?.id) {
      setPrompt({ element: <SwapPropmt initPlayer={initPlayer} withPlayer={withPlayer} onCancel={() => execute("remove-swap-card-request", [request.initId, request.withId])} /> });
    } else {
      setMenu(null);
      setMenu2(null);
      setPrompt({
        element: (
          <SwapPropmt
            initPlayer={initPlayer}
            withPlayer={withPlayer}
            onAccept={() => execute("accept-swap-card-request", [request.initId, request.withId])}
            onCancel={() => execute("remove-swap-card-request", [request.initId, request.withId])}
          />
        ),
      });
    }
  }

  return (
    <>
      <Helmet>
        <title>Kaboom • Game • {String(code || "").toUpperCase()}</title>
      </Helmet>
      <div className="absolute inset-0 flex flex-col justify-center items-center z-10 scrollbar-hide top-8">
        {me?.firstLeader && game?.phase === "rounds" && game?.round === 1 && (
          <div style={{ animationDelay: "1s" }} className="w-full h-0 relative text-center animate__animated animate__fadeIn">
            <h2 className="text-title title-shadow-secondary-xs font-extrabold text-neutral text-xl absolute left-0 right-0 bottom-4">You're first leader</h2>
          </div>
        )}
        {card && <Card nomotion={false} remoteMode={game?.remote_mode} onRemoteColorReveal={onRemoteColorReveal} onRemoteCardReveal={onRemoteCardReveal} allowColorReveal={game?.color_reveal} hide={hideCard} setHide={setHideCard} card={card} sendCard={showSendCard} />}
      </div>
    </>
  );
}

function AvatarMenu({ isHost, me, execute = () => {}, sessionToken }) {
  const { setPrompt } = useContext(PageContext);

  async function copyMigrate() {
    if (!sessionToken) return;
    try {
      await copyText(buildCurrentRoomMigrationLink(sessionToken));
      toast.success("Migrate-device link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  }

  function closeRoom() {
    execute("close-room", []);
  }

  function leaveRoom() {
    execute("leave_room", []);
    window.location.href = "/";
  }

  return (
    <div className="bg-neutral rounded-lg p-4 text-neutral-content w-full flex flex-col justify-start items-start gap-2">
      <h1 className="font-extrabold text text-title">{me.name}</h1>
      <button onClick={copyMigrate} className="btn btn-secondary w-52 noskew"><FaLink className="mr-2" />Migrate device</button>
      <button onClick={isHost ? closeRoom : leaveRoom} className="btn btn-primary w-52 noskew">{isHost ? "CLOSE GAME" : "LEAVE GAME"}</button>
      {!isHost && <button onClick={leaveRoom} className="underline text-normal text-sm">Forget this tab</button>}
    </div>
  );
}

function MiniRoundDisplay({ game }) {
  const { roundNumber, totlaRounds, nextHostageNumber } = useMemo(() => {
    const roundNumber = game?.round;
    const totlaRounds = game?.rounds?.length;
    const nextHostageNumber = game?.rounds?.[roundNumber - 1]?.hostages;
    return { roundNumber, totlaRounds, nextHostageNumber };
  }, [game]);

  return (
    <div className="w-fit px-2 py-1 bg-blue-800 text-white rounded flex items-center justify-center gap-2 text-base">
      <FaFlagCheckered className="text-white/70" />
      <span>{roundNumber}/{totlaRounds}</span>
      <span className="text-white/50">|</span>
      <div className="flex justify-start items-center">
        <PiPersonSimpleRunBold className="text-sm text-white/70" />
        <BsFillDoorOpenFill style={{ transform: "scaleX(-1)" }} className="text-white/70" />
        <span className="ml-2">{nextHostageNumber}</span>
      </div>
    </div>
  );
}

function GoToRoomScreen({ roomNr = 1, onReady = () => {}, onForceReady }) {
  const [clicked, setClicked] = useState(false);

  function handleClick() {
    onReady();
    setClicked(true);
  }

  return (
    <>
      <div className="flex flex-col items-center justify-center w-full absolute inset-0 z-10">
        <div className={`uppercase font-extrabold text-title text-3xl mb-4 animate__animated animate__bounceInLeft${roomNr == 1 ? " text-primary " : " text-secondary "}`}>GO TO</div>
        <div className={`uppercase font-extrabold text-title text-5xl mb-8 animate__animated animate__bounceInRight${roomNr == 1 ? " text-secondary " : " text-primary "}`}>ROOM {roomNr}</div>
        <button className={`btn btn-wide btn-neutral text-title ${clicked ? " btn-disabled " : ""}`} onClick={handleClick}>{clicked ? " Waiting... " : " Ready? "}</button>
        {onForceReady && <button className="text-normal font-light text-sm underline mt-6 p-3" onClick={onForceReady}>Force next</button>}
      </div>

      <div className={`h-[100vh] w-[100vh] p-22 absolute rounded-full animate-left-to-right scale-[5] -top-[50vh] opacity-50 ${roomNr == 1 ? " circular-gradient-secondary " : " circular-gradient-primary "}`}></div>
      <div className={`h-[100vh] w-[100vh] p-22 absolute rounded-full animate-right-to-left scale-[5] -bottom-[50vh] opacity-50 ${roomNr == 1 ? " circular-gradient-primary " : " circular-gradient-secondary "}`}></div>
    </>
  );
}

function RoundStartScreen({ roundName, roundNumber = 1, totalRounds = 3 }) {
  const { text, color, shadowColor } = useMemo(() => {
    switch (roundName?.toUpperCase()) {
      case "FIRST":
        return { text: "FIRST ROUND", color: "#ffffff", shadowColor: "#00ff00" };
      case "LAST":
        return { text: "LAST ROUND", color: "#ffffff", shadowColor: "#ff0000" };
      default:
        return { text: `ROUND ${roundNumber}`, color: "#ffffff", shadowColor: interpolateColor("#00ff00", "#ff0000", ((roundNumber - 1) / (totalRounds - 1)) * 100) };
    }
  }, [roundName, roundNumber, totalRounds]);

  return <div id="round-start-screen-outer" className="absolute inset-0 flex flex-col items-center justify-center anim-out-after-3"><TextBandsAnimation text={text} color={color} shadowColor={shadowColor} /></div>;
}

const DIMENSIONS_MULTIPLIER = 2;

function TextBandsAnimation({ text, color, shadowColor, animationType = "opposite-lines", rotation = -45 }) {
  const ANIMATION_TYPES = {
    "opposite-lines": ["game-start-strip", "game-start-strip-inverted", 0, "game-start-strip-opacity-animate"],
    lines: ["game-start-strip", "game-start-strip", 2, "game-start-strip-opacity-animate"],
    "lines-inverted": ["game-start-strip-inverted", "game-start-strip-inverted", 2, "game-start-strip-opacity-animate"],
  };

  const boxClasses = "text-title text-3xl font-extrabold flex items-center justify-start gap-4 p-2 py-0.5 w-fit";
  const { width, height } = useWindowDimensions();
  const [textDimensions, setTextDimensions] = useState({ textWidth: 0, textHeight: 0 });

  useEffect(() => {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.top = "-9999px";
    el.style.left = "-9999px";
    el.classList.add(...boxClasses.split(" "));
    text.split(" ").forEach((word) => {
      const wordDiv = document.createElement("div");
      wordDiv.style.textShadow = "3px 3px 0px #ff00ff";
      wordDiv.appendChild(document.createTextNode(word));
      el.appendChild(wordDiv);
    });
    document.body.appendChild(el);
    setTimeout(() => setTextDimensions({ textWidth: el.clientWidth, textHeight: el.clientHeight }));
    return () => document.body.removeChild(el);
  }, [boxClasses, text]);

  const { countForWidth, countForHeight } = useMemo(() => {
    if (!textDimensions.textWidth || !textDimensions.textHeight) return { countForWidth: 0, countForHeight: 0 };
    return {
      countForWidth: Math.ceil((width / textDimensions.textWidth) * DIMENSIONS_MULTIPLIER),
      countForHeight: Math.ceil((height / textDimensions.textHeight) * DIMENSIONS_MULTIPLIER),
    };
  }, [height, textDimensions, width]);

  const [animationClass, animationClassInverted, delayMultiplier = 2, containerAnimation = ""] = ANIMATION_TYPES[animationType || "opposite-lines"];

  return (
    <div style={{ transform: `rotate(${rotation}deg) scale(1.${Math.abs(rotation)})` }} className={`h-full flex flex-col items-center justify-center gap-2 ${containerAnimation}`}>
      {Array.from(Array(countForHeight).keys()).map((rowIndex) => {
        const inverted = rowIndex % 2 === 0;
        return (
          <div key={rowIndex} style={{ animationDelay: `${200 + rowIndex * delayMultiplier}ms` }} className={`w-full flex items-center justify-center ${inverted ? animationClass : animationClassInverted}`}>
            {Array.from(Array(countForWidth).keys()).map((colIndex) => (
              <div key={`${rowIndex}-${colIndex}`} className={boxClasses}>
                {text.split(" ").map((word, index) => {
                  const baseColor = index % 2 === 0 ? color : shadowColor;
                  const altColor = index % 2 === 0 ? shadowColor : color;
                  return <div key={`${word}-${index}`} style={{ color: inverted ? altColor : baseColor, textShadow: `3px 3px 0px ${inverted ? baseColor : altColor}` }}>{word}</div>;
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function RoundEndScreen({ hostages, onReady = () => {}, onForceReady }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-start pt-20 screen-bg-blue font-extrabold text-title text-white drop-shadow-md text-4xl gap-3 text-center overflow-y-scroll overflow-hidden scrollbar-hide">
      <h2 style={{ animationDelay: "0ms" }} className="animate__animated animate__fadeInUp">Round over!</h2>
      <h3 style={{ animationDelay: "600ms" }} className="animate__animated animate__fadeInUp text-2xl text-normal -mt-2 mb-1">Leaders, select...</h3>
      <RadialNumberAnnouncement number={hostages} />
      <h3 style={{ animationDelay: "1000ms" }} className="animate__animated animate__fadeInUp text-2xl text-normal mt-1 mb-4">...hostage{hostages === 1 ? "" : "s"}.</h3>
      <ul style={{ animationDelay: "1600ms" }} className="animate__animated animate__fadeInUp w-full text-normal text-xl font-medium text-left px-4 flex flex-col items-center gap-1.5">
        <Li title="2. Parlay" delay={1800}>Leaders meet between rooms without hostages.</Li>
        <Li title="3. Exchange hostages" delay={2000}>Equal number of hostages are exchanged.</Li>
        <Li title="4. Ready up!" delay={2200}>Hit ready when leaders return to room.</Li>
      </ul>
      <div style={{ animationDelay: "2400ms" }} className="w-full flex flex-col items-center animate__animated animate__fadeInUp mb-24">
        <ReadyButton onReady={onReady} />
        {onForceReady && <div onClick={onForceReady} className="text-normal underline text-sm text-white mt-2 cursor-pointer">Force next round</div>}
      </div>
    </div>
  );
}

function ReadyButton({ onReady, className = "" }) {
  const [clicked, setClicked] = useState(false);
  return <button onClick={() => { if (!clicked) { onReady(); setClicked(true); } }} className={`btn btn-wide mt-4 ${clicked ? "opacity-50" : ""} ${className}`}>{clicked ? "Waiting..." : "Ready!"}</button>;
}

function Li({ children, title, delay = 0 }) {
  return (
    <div style={{ animationDelay: `${delay}ms` }} className="animate__animated animate__fadeInUp bg-white text-black p-1.5 px-3 rounded-lg max-w-md w-full flex flex-col items-start">
      <h1 className="font-bold text-2xl">{title}</h1>
      <p className="text-sm font-light -mt-1.5">{children}</p>
    </div>
  );
}

function RadialNumberAnnouncement({ number = 0 }) {
  return (
    <div style={{ animationDelay: "800ms" }} className="animate__animated animate__zoomIn w-28 h-28 relative">
      <img style={{ animationDuration: "15s" }} className="opacity-10 w-full h-full animate-spin" src="/radial_blur.png" alt="" />
      <h1 className="absolute inset-0 flex justify-center items-center text-6xl">{number}</h1>
    </div>
  );
}

function PauseGameNumberScreen({ meId, isHost, onClick = () => {}, player }) {
  const { setMenu } = useContext(PageContext);
  const [playerData, setPlayerData] = useState(player);
  const [card, setCard] = useState(getCardFromId(player?.card));
  const [playerChanged, setPlayerChanged] = useState(false);

  useEffect(() => {
    if (player.id !== playerData.id) {
      setPlayerChanged(true);
      setTimeout(() => {
        setPlayerData(player);
        setCard(getCardFromId(player?.card));
        setPlayerChanged(false);
      }, 1000);
    }
  }, [player, playerData.id]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-start pt-20 screen-bg-orange font-extrabold text-title text-white drop-shadow-md text-3xl gap-3 text-center overflow-y-scroll overflow-hidden scrollbar-hide">
      <h2 style={{ animationDelay: "0ms" }} className="animate__animated animate__fadeInUp">Announcements</h2>
      <h3 style={{ animationDelay: "800ms" }} className="animate__animated animate__fadeInUp text-normal text-lg font-semibold -mt-3">{meId === playerData?.id ? `You have pause game number ${card?.pausegamenr}` : `Pause game number ${card?.pausegamenr || 5}`}</h3>
      <h3 style={{ animationDelay: "1000ms" }} className="animate__animated animate__fadeInUp text-xs text-normal font-light -mt-3">(Rulebook page 10)</h3>
      <div style={{ animationDelay: playerChanged ? "0ms" : "1600ms" }} className={`w-full flex flex-col items-center animate__animated ${playerChanged ? " animate__fadeOutUp " : " animate__fadeInUp "}`}>
        {meId === playerData?.id ? (
          <div className="w-full flex flex-col p-4 items-center gap-4 font-normal">
            <CardFront onClick={() => setMenu(<CardInfoMenu card={card} color={card.color} />)} card={card} color={card.color} />
            <button className="btn-accent btn btn-wide" onClick={onClick}>Next</button>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center p-4 mt-8 gap-2">
            <div className="w-44 h-44 rounded-full border-4 border-white"><Avatar className="w-full h-full" {...playerData?.avaConfig} /></div>
            <h1 className="truncate text-3xl">{playerData?.name}</h1>
            <h2 className="text-lg text-normal -mt-2">...is presenting their card</h2>
            <p className="text-lg text-normal">🚫 Do not reveal your card to anyone yet.</p>
            {isHost && <button className="text-normal font-light text-sm underline mt-6" onClick={onClick}>Force next</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function RevealAllScreen({ onLobby, onClose, card, buriedCard }) {
  const { setMenu } = useContext(PageContext);
  return (
    <>
      <div className="screen-bg absolute z-20 inset-0" />
      <div className="h-[100vh] w-[100vh] p-22 absolute rounded-full animate-left-to-right scale-[5] -top-[50vh] opacity-50 circular-gradient-secondary z-20"></div>
      <div className="h-[100vh] w-[100vh] p-22 absolute rounded-full animate-right-to-left scale-[5] -bottom-[50vh] opacity-50 circular-gradient-primary z-20"></div>
      <div className="absolute inset-0 flex flex-col items-center justify-start pt-16 pb-32 font-extrabold text-title text-white drop-shadow-md text-4xl gap-3 text-center overflow-y-scroll overflow-hidden scrollbar-hide z-20">
        <h2 style={{ animationDelay: "0ms" }} className="animate__animated animate__fadeInUp">Game over!</h2>
        <h3 style={{ animationDelay: "600ms" }} className="animate__animated animate__fadeInUp text-2xl text-normal -mt-2 mb-1">Reveal your card!</h3>
        <div style={{ animationDelay: "1200ms" }} className="animate__animated animate__fadeInUp my-6 font-normal">
          {card && <CardFront onClick={() => setMenu(<CardInfoMenu card={card} color={card.color} />)} card={card} color={card?.color} />}
        </div>
        {buriedCard && (
          <div style={{ animationDelay: "2200ms" }} className="animate__animated animate__fadeInUp flex items-center justify-center w-full gap-6 -my-4">
            <div className="text-title font-extrabold text-xl">BURIED CARD:</div>
            <div className="scale-[16%] -m-28 -my-40"><CardFront onClick={() => setMenu(<CardInfoMenu card={buriedCard} color={buriedCard.color} />)} card={buriedCard} color={buriedCard.color} /></div>
          </div>
        )}
        <div style={{ animationDelay: "3000ms" }} className="w-full flex flex-col items-center animate__animated animate__fadeInUp">
          {onLobby && <button onClick={onLobby} className="btn btn-wide btn-success text-title font-extrabold mt-6">Return to lobby!</button>}
          {onClose && <button onClick={onClose} className="underline text-normal text-sm mt-4">Close game</button>}
        </div>
        {!onLobby && !onClose && <Link style={{ animationDelay: "3000ms" }} to="/" className="animate__animated animate__fadeIn underline text-normal font-normal text-sm mt-8 z-20 w-full text-center text-base-100">Leave</Link>}
      </div>
    </>
  );
}

function CardRevealToast({ card, player }) {
  if (!card || !player) return null;
  return (
    <div className="w-full max-w-md text-base-content bg-base-100 shadow grid grid-cols-[3rem_minmax(0,_1fr)] items-center justify-start rounded px-3 py-2">
      <div className="card relative scale-[18%] -m-28 -my-40"><CardFront card={card} color={card?.color} /></div>
      <div className="w-full flex flex-col pl-2.5">
        <div className="text-title font-extrabold opacity-70 text-xs w-full flex items-center"><TbPlayCard size={18} className="mr-1" /> <p>CARD REVEAL</p></div>
        <div className="text-title font-extrabold text-sm sm:text-lg pl-1 w-full overflow-clip flex items-center justify-start gap-1.5 flex-nowrap whitespace-nowrap pr-2"><div className="truncate shrink">{player?.name}</div> is <div style={{ color: card?.color?.primary }}>{card?.name}</div></div>
      </div>
    </div>
  );
}

function ColorRevealToast({ color, player }) {
  if (!color || !player) return null;
  return (
    <div className="w-full max-w-md text-base-content bg-base-100 shadow grid grid-cols-[3rem_minmax(0,_1fr)] items-center justify-start rounded-xl p-2">
      <div style={{ backgroundColor: color?.secondary, color: color?.primary }} className="h-12 w-12 rounded-lg text-xl flex items-center justify-center">{color?.icon && <color.icon />}</div>
      <div className="grow flex flex-col pl-3">
        <div className="text-title font-extrabold opacity-70 text-xs w-full flex items-center"><IoColorPaletteSharp size={18} className="mr-1" /> <p>COLOR REVEAL</p></div>
        <div className="text-title font-extrabold text-sm sm:text-lg pl-1 w-full overflow-clip flex items-center justify-start gap-1.5 flex-nowrap whitespace-nowrap pr-2"><div className="truncate shrink">{player?.name}</div> is in <div style={{ color: color?.primary }}>{color?.title}</div></div>
      </div>
    </div>
  );
}

export default GameView;
