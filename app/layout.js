import "./globals.css";

export const metadata = {
  title: "next-room-reserve-app · ระบบห้องประชุมและการจอง",
  description: "Assignment08: API จัดการห้องประชุมและการจอง ด้วย Next.js, Prisma และ MySQL",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
