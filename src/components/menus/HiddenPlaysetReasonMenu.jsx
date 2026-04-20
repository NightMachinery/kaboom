function HiddenPlaysetReasonMenu({ reason }) {
  return (
    <div className="w-full flex flex-col justify-center items-center text-left max-w-[24rem] overflow-hidden p-3 px-4 bg-base-100 text-base-content rounded-xl">
      <h1 className="w-full text-left font-extrabold text-title">Reason</h1>
      <p className="w-full pt-2 text-sm overflow-y-scroll">
        {reason?.length > 2 ? reason : <span className="font-thin text-base-300">No reason provided</span>}
      </p>
      <div className="w-[50rem]"></div>
    </div>
  );
}

export default HiddenPlaysetReasonMenu;
