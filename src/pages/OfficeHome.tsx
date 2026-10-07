import { Link } from 'react-router'
import { ClockIcon } from '../components/Icons'
import { PageHeader } from '../components/PageHeader'
import { attentionHeadline, formatMeasure } from '../lib/attention'
import { useLocationFilter } from '../lib/LocationContext'
import { officeHomeData, type AttentionRow, type CountTile } from '../lib/officeHome'

// Management by exception: what needs attention first, then today, then the boards.

const todayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

export function OfficeHome({ now = new Date() }: { now?: Date }) {
  const { location } = useLocationFilter()
  const data = officeHomeData(location)

  return (
    <>
      <PageHeader eyebrow={todayLabel.format(now)} title={attentionHeadline(data.attention.length)} />

      <div className="home-columns">
        <section aria-label="Needs attention" className="panel attention">
          {data.attention.length === 0 ? (
            <p className="attention-empty">Every job in this location is on track.</p>
          ) : (
            data.attention.map((row, index) => <AttentionRowLink key={row.id} row={row} isNext={index === 0} />)
          )}
        </section>

        <section aria-labelledby="today-title" className="today">
          <h2 id="today-title" className="section-title">
            Today
          </h2>
          <div className="panel">
            {data.today.length === 0 ? (
              <p className="attention-empty">Nothing scheduled today.</p>
            ) : (
              data.today.map((entry) => (
                <Link key={entry.id} to={entry.to} className="today-row">
                  {entry.time ? (
                    <div className="today-row__when">{entry.time}</div>
                  ) : (
                    <div className="today-row__when today-row__when--live">On site now</div>
                  )}
                  <div className="today-row__what">
                    <div className="today-row__title">{entry.title}</div>
                    <div className="today-row__where">{entry.address}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      <section aria-labelledby="boards-title" className="boards">
        <h2 id="boards-title" className="section-title">
          Boards
        </h2>
        <div className="board-tiles">
          {data.boards.map((board) => (
            <BoardTile key={board.key} tile={board} />
          ))}
          {data.views.map((view) => (
            <ViewTile key={view.key} tile={view} />
          ))}
        </div>
      </section>
    </>
  )
}

function AttentionRowLink({ row, isNext }: { row: AttentionRow; isNext: boolean }) {
  // The top row is the next thing to deal with, so it gets the yellow tint.
  // Red only appears on late or below-threshold items, always with its label.
  const chipClass = row.late ? (isNext ? 'chip chip--late-strong' : 'chip chip--late') : 'chip'
  return (
    <Link to={row.to} className={isNext ? 'attention-row attention-row--next' : 'attention-row'}>
      <div className="attention-row__count">{row.count}</div>
      <div className="attention-row__text">
        <div className="attention-row__title">{row.title}</div>
        <div className="attention-row__detail">{row.detail}</div>
      </div>
      <div className={chipClass}>
        {row.late && isNext && <ClockIcon />}
        {row.late && <span className="visually-hidden">Late: </span>}
        {formatMeasure(row.part.measure)}
      </div>
    </Link>
  )
}

function BoardTile({ tile }: { tile: CountTile }) {
  return (
    <Link to="/boards" className="board-tile">
      <span className="board-tile__name">
        <span className="board-dot" style={{ background: `var(--board-${tile.key.replaceAll('_', '-')})` }} />
        <span>{tile.name}</span>
      </span>
      <span className="board-tile__count">{tile.count}</span>
      <span className="board-tile__unit">{tile.count === 1 ? 'job' : 'jobs'}</span>
    </Link>
  )
}

function ViewTile({ tile }: { tile: CountTile }) {
  return (
    <Link to="/boards" className="board-tile board-tile--view">
      <span className="board-tile__name">{tile.name}</span>
      <span className="board-tile__count">{tile.count}</span>
      <span className="board-tile__unit">across every board</span>
    </Link>
  )
}
