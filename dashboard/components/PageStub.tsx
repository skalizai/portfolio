export function PageStub({ title, description }: { title: string; description: string }) {
  return (
    <>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-dim">{description}</p>
    </>
  );
}
