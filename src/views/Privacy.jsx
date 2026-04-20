import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { FaBomb } from "react-icons/fa";

function Privacy() {
  return (
    <div className="w-full h-full overflow-y-scroll pb-20 flex justify-center">
      <Helmet>
        <title>Kaboom • Privacy</title>
      </Helmet>

      <div className="w-full max-w-3xl p-4 md:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between text-title text-2xl font-extrabold">
          <Link to="/" className="flex items-center gap-3 text-primary">
            <FaBomb />
            <span>KABOOM</span>
          </Link>
          <span className="text-secondary">Privacy</span>
        </div>

        <section className="rounded-2xl border-2 border-neutral/20 bg-base-100 p-4 md:p-6 space-y-4">
          <p>
            Self-hosted Kaboom is designed for local or intranet deployment. The application stores a local guest token,
            your chosen display name, room-scoped reconnect/session tokens, and local UI preferences in your browser.
          </p>
          <p>
            The self-hosted server keeps active room state in memory while the room is open. That includes room code,
            player display names, player IDs, room-scoped session hashes, selected playset, and current game state.
          </p>
          <p>
            No Google, Discord, Supabase, Firebase, analytics, captcha, or advertising services are required in the
            self-hosted flow.
          </p>
          <p>
            When a room closes or the backend restarts, active room state is removed. Browser-stored guest identity and
            room-scoped reconnect tokens remain on the device until you clear local storage.
          </p>
        </section>
      </div>
    </div>
  );
}

export default Privacy;
