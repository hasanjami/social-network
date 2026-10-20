import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/authContext";
import { WebSocketProvider } from "@/contexts/websocketContext";
import { ToastProvider } from "@/contexts/toastContext";
import { ConfirmProvider } from "@/contexts/confirmContext";
import NotificationListener from "@/components/notifications/NotificationListener";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Social Network",
  description: "A small Facebook-style social network",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <WebSocketProvider>
            <ToastProvider>
              <ConfirmProvider>
                <NotificationListener />
                {children}
              </ConfirmProvider>
            </ToastProvider>
          </WebSocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}