import { Fragment } from 'react'

const LATEX_SYMBOLS = {
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\Delta': 'Δ',
  '\\theta': 'θ',
  '\\lambda': 'λ',
  '\\mu': 'μ',
  '\\pi': 'π',
  '\\sigma': 'σ',
  '\\omega': 'ω',
  '\\infty': '∞',
  '\\int': '∫',
  '\\cdot': '·',
  '\\times': '×',
  '\\leq': '≤',
  '\\geq': '≥',
  '\\neq': '≠',
  '\\sqrt': '√',
}

const readLatexGroup = (value, startIndex) => {
  if (value[startIndex] !== '{') {
    return { content: value[startIndex] ?? '', nextIndex: startIndex + 1 }
  }

  let depth = 0
  let content = ''

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index]
    if (char === '{') {
      if (depth > 0) content += char
      depth += 1
      continue
    }

    if (char === '}') {
      depth -= 1
      if (depth === 0) return { content, nextIndex: index + 1 }
      content += char
      continue
    }

    content += char
  }

  return { content, nextIndex: value.length }
}

function MathContent({ value }) {
  const nodes = []
  let index = 0

  while (index < value.length) {
    const remaining = value.slice(index)

    if (remaining.startsWith('\\frac')) {
      const numerator = readLatexGroup(value, index + 5)
      const denominator = readLatexGroup(value, numerator.nextIndex)
      nodes.push(
        <span className="math-frac" key={`${index}-frac`}>
          <span><MathContent value={numerator.content} /></span>
          <span><MathContent value={denominator.content} /></span>
        </span>,
      )
      index = denominator.nextIndex
      continue
    }

    if (value[index] === '^' || value[index] === '_') {
      const group = readLatexGroup(value, index + 1)
      const Tag = value[index] === '^' ? 'sup' : 'sub'
      nodes.push(<Tag key={`${index}-script`}><MathContent value={group.content} /></Tag>)
      index = group.nextIndex
      continue
    }

    const command = Object.keys(LATEX_SYMBOLS).find((item) => remaining.startsWith(item))
    if (command) {
      nodes.push(<Fragment key={`${index}-symbol`}>{LATEX_SYMBOLS[command]}</Fragment>)
      index += command.length
      continue
    }

    if (value[index] === '\\') {
      index += 1
      continue
    }

    nodes.push(<Fragment key={`${index}-char`}>{value[index]}</Fragment>)
    index += 1
  }

  return nodes
}

function MathInline({ value }) {
  return (
    <span className="math-inline" aria-label={value}>
      <MathContent value={value} />
    </span>
  )
}

const renderPlainInline = (text, prefix) => {
  const nodes = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let cursor = 0
  let match = pattern.exec(text)

  while (match) {
    if (match.index > cursor) {
      nodes.push(<Fragment key={`${prefix}-txt-${cursor}`}>{text.slice(cursor, match.index)}</Fragment>)
    }

    const token = match[0]
    if (token.startsWith('`')) {
      nodes.push(<code key={`${prefix}-code-${match.index}`}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={`${prefix}-bold-${match.index}`}>{token.slice(2, -2)}</strong>)
    } else {
      nodes.push(<em key={`${prefix}-em-${match.index}`}>{token.slice(1, -1)}</em>)
    }

    cursor = match.index + token.length
    match = pattern.exec(text)
  }

  if (cursor < text.length) {
    nodes.push(<Fragment key={`${prefix}-txt-${cursor}`}>{text.slice(cursor)}</Fragment>)
  }

  return nodes
}

const renderInline = (text, prefix) => {
  const parts = String(text ?? '').split(/(\$[^$]+\$)/g)

  return parts.map((part, index) => {
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      return <MathInline value={part.slice(1, -1)} key={`${prefix}-math-${index}`} />
    }

    return <Fragment key={`${prefix}-plain-${index}`}>{renderPlainInline(part, `${prefix}-${index}`)}</Fragment>
  })
}

function MarkdownMathRenderer({ content, className = '' }) {
  const lines = String(content ?? '').split(/\r?\n/)
  const blocks = []
  let listItems = []

  const flushList = () => {
    if (!listItems.length) return
    blocks.push(
      <ul key={`list-${blocks.length}`}>
        {listItems.map((item, index) => (
          <li key={`${item}-${index}`}>{renderInline(item, `li-${blocks.length}-${index}`)}</li>
        ))}
      </ul>,
    )
    listItems = []
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    const listMatch = /^[-*]\s+(.+)$/.exec(trimmed)

    if (!trimmed) {
      flushList()
      return
    }

    if (listMatch) {
      listItems.push(listMatch[1])
      return
    }

    flushList()
    blocks.push(<p key={`p-${index}`}>{renderInline(trimmed, `p-${index}`)}</p>)
  })

  flushList()

  return <div className={`markdown-math ${className}`.trim()}>{blocks}</div>
}

export default MarkdownMathRenderer
