import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

const components: Components = {
  a({ href, children, ...rest }) {
    const safe = typeof href === "string" ? href : undefined;
    const external = !!safe && /^(https?:|mailto:)/i.test(safe);
    return (
      <a
        {...rest}
        href={safe}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
};

type Props = {
  source: string;
  className?: string;
};

/** Read-only Markdown(GFM) + sanitized HTML for ticket description/comments. */
export function RichContent({ source, className }: Props) {
  const text = source ?? "";
  return (
    <div className={["rich-content", className].filter(Boolean).join(" ")}>
      {text.trim() ? (
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
          components={components}
        >
          {text}
        </Markdown>
      ) : null}
    </div>
  );
}
