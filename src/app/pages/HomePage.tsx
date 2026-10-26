import { Link } from 'react-router'
import { modules } from '@/app/registry'

/** Home dạng launcher: mỗi module một ô. Agent frontend sẽ dựng lại theo design của ui-design. */
export function HomePage() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-semibold">Callone</h1>
      <ul className="mt-6 grid gap-3">
        {modules.map((module) => (
          <li key={module.id}>
            <Link to={module.basePath} className="block rounded-lg border p-4">
              <span className="font-medium">{module.title}</span>
              <span className="mt-1 block text-sm opacity-70">{module.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
