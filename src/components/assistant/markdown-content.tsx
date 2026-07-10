/**
 * MarkdownContent — Renderizador bonito de Markdown para o Assistente IA
 *
 * Renderiza headings, listas, negrito, tabelas e blocos de código
 * com o estilo visual do Manicure Fácil.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  // Headings
  h1: ({ children, ...props }) => (
    <h1 className="text-lg font-bold text-card-foreground mt-4 mb-2 first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-base font-semibold text-card-foreground mt-3 mb-2 first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-sm font-semibold text-card-foreground mt-3 mb-1.5 first:mt-0" {...props}>
      {children}
    </h3>
  ),

  // Paragraph
  p: ({ children, ...props }) => (
    <p className="mb-2 last:mb-0 leading-relaxed" {...props}>
      {children}
    </p>
  ),

  // Lists
  ul: ({ children, ...props }) => (
    <ul className="list-disc pl-5 mb-2 space-y-1 last:mb-0" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-5 mb-2 space-y-1 last:mb-0" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-sm leading-relaxed" {...props}>
      {children}
    </li>
  ),

  // Bold & Italic
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-card-foreground" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),

  // Tables
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto mb-3 last:mb-0">
      <table
        className="w-full text-xs border-collapse border border-border rounded-xl overflow-hidden"
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-muted/80" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody className="divide-y divide-border" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }) => (
    <tr className="hover:bg-muted/30 transition-colors" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th className="px-3 py-2 text-left font-semibold text-card-foreground border-b border-border" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-3 py-2 text-muted-foreground" {...props}>
      {children}
    </td>
  ),

  // Code
  code: ({ children, className, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded-md bg-[#D946EF]/10 text-[#D946EF] text-xs font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <pre className="mb-3 last:mb-0 p-3 rounded-xl bg-[#111118] border border-[#252836] overflow-x-auto">
        <code className="text-xs font-mono text-gray-200 leading-relaxed block" {...props}>
          {children}
        </code>
      </pre>
    );
  },
  pre: ({ children }) => <>{children}</>,

  // Horizontal rule
  hr: (props) => (
    <hr className="my-4 border-border" {...props} />
  ),

  // Blockquote
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-2 border-[#D946EF] pl-4 py-1 mb-3 last:mb-0 bg-[#D946EF]/5 rounded-r-lg italic text-muted-foreground"
      {...props}
    >
      {children}
    </blockquote>
  ),

  // Links
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#D946EF] hover:text-[#A855F7] underline underline-offset-2 transition-colors"
      {...props}
    >
      {children}
    </a>
  ),
};

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-content prose prose-sm max-w-none text-muted-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
