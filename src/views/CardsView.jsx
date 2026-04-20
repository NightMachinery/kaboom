import { useContext } from "react";
import { Helmet } from "react-helmet";
import { Link, useSearchParams } from "react-router-dom";
import { TbCardsFilled } from "react-icons/tb";
import { FaBomb } from "react-icons/fa";

import { PageContext } from "../components/PageContextProvider";
import CardsFilter from "../components/CardsFilter";
import CardInfoMenu from "../components/menus/CardInfoMenu";

function CardsView() {
  const { setMenu } = useContext(PageContext);
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <div className="flex flex-col justify-start items-center w-full h-full overflow-x-hidden relative scrollbar-hide overflow-y-scroll pb-20">
      <Helmet>
        <title>Kaboom • Cards</title>
      </Helmet>

      <div className="w-full max-w-5xl p-4 flex items-center justify-between text-title text-secondary text-2xl md:text-3xl font-extrabold">
        <Link to="/" className="flex items-center gap-3 text-primary">
          <FaBomb />
          <span>KABOOM</span>
        </Link>
        <div className="flex items-center gap-3 text-secondary">
          <TbCardsFilled />
          <span>Cards</span>
        </div>
      </div>

      <div className="w-full max-w-5xl p-2 pt-0">
        <CardsFilter
          onSearchUpdate={(search) => setSearchParams(search ? `s=${search}` : "")}
          defaultSearch={searchParams.get("s") || ""}
          onClick={(card) => setMenu(<CardInfoMenu card={card} color={card?.color} />)}
        />
      </div>
    </div>
  );
}

export default CardsView;
