import { getCurrentUserContext } from "@/lib/current-user";
import { signIn, signOut } from "@/auth";

export default async function DashboardPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    return (
      <main>
        <h1>Farfalla Asset &amp; Property Management</h1>
        <p>No hay sesión activa.</p>
        <form
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id");
          }}
        >
          <button type="submit">Iniciar sesión con Microsoft Entra ID</button>
        </form>
      </main>
    );
  }

  return (
    <main>
      <h1>Farfalla Asset &amp; Property Management</h1>
      <p>
        Sesión iniciada como <strong>{context.displayName}</strong> ({context.email})
      </p>
      <p>Organización: {context.organizationId}</p>
      <h2>Roles y alcances</h2>
      <ul>
        {context.roles.map((role, index) => (
          <li key={index}>
            {role.roleName} — alcance: {role.scopeType}
            {role.scopeId ? ` (${role.scopeId})` : ""}
          </li>
        ))}
      </ul>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button type="submit">Cerrar sesión</button>
      </form>
    </main>
  );
}
