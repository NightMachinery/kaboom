import { useMemo } from "react";
import { BsCassetteFill } from "react-icons/bs";
import { FaCheck } from "react-icons/fa";

import { getAllPlaysetsArray } from "../../helpers/playsets";

function playsetLabel(playset) {
  if (!playset) return "";
  if (playset.min_players === playset.max_players) return `${playset.min_players}`;
  return `${playset.min_players}-${playset.max_players}`;
}

export default function PlaysetPicker({ selectedPlaysetId, onSelect }) {
  const playsets = useMemo(() => getAllPlaysetsArray(), []);

  return (
    <div className="w-full max-w-3xl flex flex-col gap-3">
      {playsets.map((playset) => {
        const selected = playset.id === selectedPlaysetId;
        return (
          <button
            key={playset.id}
            type="button"
            onClick={() => onSelect?.(playset.id)}
            className={`w-full rounded-xl border-2 text-left p-4 transition-all ${selected ? "border-secondary bg-secondary/10" : "border-neutral/20 bg-base-100 hover:border-secondary/40"}`}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundColor: `${playset.color || "#c342ff"}20`, color: playset.color || "#c342ff" }}
              >
                {playset.emoji || <BsCassetteFill />}
              </div>
              <div className="grow min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-title text-xl font-extrabold truncate">{playset.name}</h3>
                  {selected && <FaCheck className="text-secondary shrink-0" />}
                </div>
                <p className="text-sm opacity-80">{playsetLabel(playset)} players</p>
                {playset.description && <p className="text-sm mt-2 opacity-80">{playset.description}</p>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
