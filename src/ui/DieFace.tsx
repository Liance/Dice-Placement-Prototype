import './dice.css';

type DieFaceProps = {
  value: number;
  rolling?: boolean;
};

export function DieFace({ value, rolling = false }: DieFaceProps) {
  const activeIndexes: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  return (
    <div className={`die ${rolling ? 'die--rolling' : ''}`}>
      <div className={`die__grid die__grid--${value}`}>
        {Array.from({ length: 9 }, (_, index) => (
          <span
            key={index}
            className={`die__pip ${activeIndexes[value]?.includes(index) ? 'die__pip--on' : ''}`}
          />
        ))}
      </div>
      <span className="die__value">{value}</span>
    </div>
  );
}
