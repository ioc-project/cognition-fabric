import {useEffect, useMemo, useRef, useState} from 'react';

const LavaLampCircle: React.FC<{
  maxX?: number;
  maxY?: number;
  speed?: number;
}> = ({maxX = window.innerWidth / 4, maxY = window.innerHeight, speed = 0.1}) => {
  const getRandomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min) + min);
  const [velocityX, setVelocityX] = useState(Math.random() > 0.5 ? speed : -speed);
  const [velocityY, setVelocityY] = useState(Math.random() > 0.5 ? speed : -speed);
  const [x, setX] = useState(getRandomBetween(0, maxX ? maxX : 0));
  const [y, setY] = useState(getRandomBetween(0, maxY ? maxY : 0));

  const [width, setWidth] = useState(getRandomBetween(150, 500));
  const [height, setHeight] = useState(getRandomBetween(150, 500));
  const [sizeVelocity, setSizeVelocity] = useState(1);

  const opacity = useMemo(() => Math.random(), []);

  const mixBlendMode = useMemo(() => {
    const blendModes = ['soft-light', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'color-dodge', 'color-burn', 'hard-light'];
    return blendModes[getRandomBetween(0, blendModes.length - 1)];
  }, []);

  const color = useMemo(() => {
    const colors = ['#23a6d5', '#23d5ab', '#2498dd', '#23d5ab', '#38bdf8', '#0284c7', '#60a5fa', '#bfdbfe', '#bae6fd'];
    return colors[getRandomBetween(0, colors.length - 1)];
  }, []);

  const blur = useMemo(() => {
    return `blur(${getRandomBetween(0, 10)}px)`;
  }, []);

  const handleAnimation = () => {
    if (maxX && maxY) {
      if (x + velocityX > maxX || x + velocityX < 0) {
        setVelocityX(-velocityX);
      }
      if (y + velocityY > maxY || y + velocityY < 0) {
        setVelocityY(-velocityY);
      }
      setX(x + velocityX);
      setY(y + velocityY);
      if (width + sizeVelocity > 500 || width + sizeVelocity < 150) {
        setSizeVelocity(-sizeVelocity);
      }
      setWidth(width + sizeVelocity);
      setHeight(height + sizeVelocity);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      handleAnimation();
    }, 1000 / 60);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y]);

  return (
    <div
      className="absolute rounded-full aspect-square blend-multiply"
      style={{
        backgroundColor: color,
        transform: `translate(${x}px, ${y}px)`,
        width: width,
        height: height,
        opacity: opacity,
        mixBlendMode: mixBlendMode as any,
        filter: blur
      }}
    />
  );
};

const LavaLamp: React.FC<{
  speed?: number;
}> = ({speed}) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div
        ref={ref}
        className="relative w-full h-full overflow-hidden bg-gradient-to-br from-white via-[#00bfd8] to-[#0083f5] skew-x-[25deg] blur-3xl welcome-blur"
        style={{
          position: 'relative',
          width: '100%'
        }}
      >
        {Array.from({length: 15}).map((_, i) => (
          <LavaLampCircle key={`lava-lamp-circle-${i}`} maxX={ref.current?.clientWidth} maxY={ref.current?.clientHeight} speed={speed} />
        ))}
      </div>
    </>
  );
};

export default LavaLamp;
