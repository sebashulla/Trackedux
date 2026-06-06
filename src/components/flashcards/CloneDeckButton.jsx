import { Copy, LoaderCircle } from 'lucide-react'

function CloneDeckButton({ onClone, loading, disabled }) {
  return (
    <button className="secondary-btn deck-action" type="button" onClick={onClone} disabled={disabled || loading}>
      {loading ? <LoaderCircle className="spinner" size={17} /> : <Copy size={17} />}
      Clonar
    </button>
  )
}

export default CloneDeckButton
