/// <reference types="react" />
import type { AppProps } from "next/app";
export default function App({ Component, pageProps, ...props }: AppProps): import("react").JSX.Element;
