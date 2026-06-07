import { Children, isValidElement, memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { normalizeLlmContent } from '../../shared/content-normalize'
import EChartsBlock from './EChartsBlock'
import { isEchartsOptionJson } from './parseEchartsJson'

interface Props {
  content: string
}

function extractPreCode(children: React.ReactNode): { className: string; raw: string } {
  let className = ''
  let raw = ''

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const props = child.props as { className?: string; children?: React.ReactNode }
    className = props.className || className
    raw = String(props.children ?? '').replace(/\n$/, '')
  })

  return { className, raw }
}

function MarkdownContent({ content }: Props) {
  const normalized = useMemo(() => normalizeLlmContent(content), [content])

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }) {
          const { className, raw } = extractPreCode(children)
          const lang = /language-(\w+)/.exec(className)?.[1]?.toLowerCase()

          if (
            lang === 'echarts' ||
            ((lang === 'json' || !lang) && raw.trim() && isEchartsOptionJson(raw))
          ) {
            return <EChartsBlock source={raw} />
          }

          return <pre className="md-pre">{children}</pre>
        },
        code({ className, children, ...props }) {
          const isFenced = /language-/.test(className || '')
          if (isFenced) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          }
          return (
            <code className="md-inline-code" {...props}>
              {children}
            </code>
          )
        },
        table({ children }) {
          return (
            <div className="md-table-wrap">
              <table>{children}</table>
            </div>
          )
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          )
        }
      }}
    >
      {normalized}
    </ReactMarkdown>
  )
}

export default memo(MarkdownContent)
