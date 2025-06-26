export const metadata = {
  title: 'Pigseller',
  description: 'Pigseller demo site',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
