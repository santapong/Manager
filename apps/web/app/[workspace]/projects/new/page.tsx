import { NewProjectForm } from "./new-project-form";

export const dynamic = "force-dynamic";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">New project</h1>
      <p className="mb-6 text-sm text-gray-600">
        Pick a short uppercase key (e.g. <span className="font-mono">ENG</span>) — tasks will get
        keys like <span className="font-mono">ENG-1</span>.
      </p>
      <NewProjectForm />
    </div>
  );
}
