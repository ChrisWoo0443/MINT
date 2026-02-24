import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Auth } from './components/Auth'

function AppContent(): React.JSX.Element {
  const { session } = useAuth()

  if (!session) return <Auth />

  return (
    <div>
      <h1>MINT — Dashboard</h1>
    </div>
  )
}

function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
