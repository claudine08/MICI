import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

// Auth.js v5 (§11.6): JWT strategy, credenciais + scrypt, página própria /entrar.

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/entrar" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash || user.deletedAt) return null;
        if (user.status !== "ACTIVE") return null;

        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user?.id) token.userId = user.id;
      return token;
    },
    session: async ({ session, token }) => {
      if (token.userId && typeof token.userId === "string") {
        // Revalida o id do JWT contra o banco: a sessão é stateless (7 dias) e
        // sobrevive a reset/troca de banco, deixando um userId huérfano. Sem
        // isto, a página de seleção de organização mostra "Olá, {nome}" com uma
        // sessão que o backend rejeita. Id inválido => sem session.user.id =>
        // redirect("/entrar") ou 401 nos handlers de API.
        try {
          const user = await prisma.user.findUnique({
            where: { id: token.userId },
            select: { status: true, deletedAt: true },
          });
          if (user && !user.deletedAt && user.status === "ACTIVE") {
            session.user.id = token.userId;
          }
        } catch (error) {
          // O Auth.js embrulha QUALQUER erro lançado neste callback como
          // JWTSessionError opaco (ex.: Postgres fora do ar, userId não-UUID),
          // mascarando a causa real. Degrada para "sem sessão" e registra o
          // motivo verdadeiro.
          console.warn(
            "[auth] Falha ao validar a sessão no banco; tratando como não autenticado:",
            error instanceof Error ? error.message : error
          );
        }
      }
      return session;
    },
  },
});
