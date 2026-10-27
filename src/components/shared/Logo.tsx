export default function Logo({ admin = false }: { admin?: boolean }) {
  const logo = (
    <img
      src="/mylnder-logo.png"
      alt="mylnder — Campus Community"
      className="h-10 w-auto object-contain sm:h-12"
    />
  );

  if (!admin) return logo;

  return (
    <div className="admin-logo-frame rounded-2xl border border-blue-300/40 bg-[#102238] p-1.5">
      {logo}
    </div>
  );
}