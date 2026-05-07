export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#f5f5f0', minHeight: '100vh' }}>
      {children}
    </div>
  )
}
