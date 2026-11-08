import ReactMarkdown from "react-markdown";

// Key terms the model wraps in **bold** become the violet "term" chips from the Stitch summary screens.
const components = {
  strong: ({ children }) => <span className="term">{children}</span>,
};

export default function Markdown({ children, className = "reading" }) {
  return (
    <div className={className}>
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
