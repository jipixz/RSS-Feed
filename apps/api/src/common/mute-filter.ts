import { Prisma } from '@prisma/client';

/**
 * RN-02/RN-03: cláusula Prisma que excluye artículos que hacen match de mute
 * (substring, case-insensitive*) sobre title + excerpt + fullContent + source.
 * *SQLite LIKE es case-insensitive para ASCII; términos con acentos hacen
 * match exacto de substring.
 */
export function excludeMutesWhere(mutes: string[]): Prisma.ArticleWhereInput {
  const terms = mutes.map((t) => t.trim()).filter(Boolean);
  if (terms.length === 0) return {};
  return {
    NOT: terms.map((term) => ({
      OR: [
        { title: { contains: term } },
        { excerpt: { contains: term } },
        { fullContent: { contains: term } },
        { feed: { title: { contains: term } } },
      ],
    })),
  };
}
