/** A placeholder for a Household & Family tab that's built in a later step. */
export function ComingNext({ title, description }: { title: string; description: string }) {
  return (
    <>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-4 max-w-2xl rounded-[1.5rem] border border-line bg-surface p-5 text-dim">{description}</p>
    </>
  );
}
