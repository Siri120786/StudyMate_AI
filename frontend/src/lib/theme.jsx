import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({ theme: "dark", toggle() {} });
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => (document.documentElement.classList.contains("light") ? "light" : "dark"));

  useEffect(() => {
    // swap only the theme classes; replacing className would also drop "icons-ready" and hide every icon
    const root = document.documentElement.classList;
    root.remove("light", "dark");
    root.add(theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f4fafd" : "#0e1416");
    try {
      localStorage.setItem("studymate-theme", theme);
    } catch {}
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}>
      {children}
    </ThemeContext.Provider>
  );
}
