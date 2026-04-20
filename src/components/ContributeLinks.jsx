function ContributeLinks() {
  return (
    <div className="w-full flex flex-col items-center max-w-md gap-2 px-10 my-4">
      <h1 className="text-title font-extrabold text-2xl py-4">Project</h1>
      <Link className="bg-[#1b1f23] border-4 border-[#1b1f23] text-white font-bold text-2xl" src="/github.png" href="https://github.com/NightMachinery/kaboom">
        Repository
      </Link>
      <p className="text-center text-sm opacity-70">This self-hosted fork is designed for intranet deployments and local-first play.</p>
    </div>
  );
}

function Link({ src = "", href = "/", children, className = "" }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`shadow-lg hover:shadow-xl transition-all hover:scale-105 clickable rounded-full h-14 p-1.5 w-full flex justify-start items-center gap-3 ${className}`}>
      <img className="h-full" src={src} alt="" />
      {children}
    </a>
  );
}

export default ContributeLinks;
