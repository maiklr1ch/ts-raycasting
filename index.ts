
const EPS = 1e-7
const NEAR_CLIPPING_PLANE = EPS
const FAR_CLIPPING_PLANE = 10.0
const FOV = Math.PI / 2
const SCREEN_WIDTH = 800 // count of rays
const PLAYER_STEP_LEN = 0.5
const PLAYER_SPEED = 2.5

class Vector2 {
  x: number
  y: number

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  static zero(): Vector2 {
    return new Vector2(0, 0)
  }

  static fromAngle(angle: number): Vector2 {
    return new Vector2(Math.cos(angle), Math.sin(angle))
  }

  add(that: Vector2): Vector2 {
    return new Vector2(this.x + that.x, this.y + that.y)
  }

  sub(that: Vector2): Vector2 {
    return new Vector2(this.x - that.x, this.y - that.y)
  }

  mul(that: Vector2): Vector2 {
    return new Vector2(this.x * that.x, this.y * that.y)
  }

  div(that: Vector2): Vector2 {
    return new Vector2(this.x / that.x, this.y / that.y)
  }

  length(): number {
    return Math.sqrt(this.sqrLength())
  }

  sqrLength(): number {
    return this.x * this.x + this.y * this.y
  }

  norm(): Vector2 {
    const len = this.length()
    if (len == 0) return Vector2.zero()
    return new Vector2(this.x / len, this.y / len)
  }

  scale(value: number): Vector2 {
    return new Vector2(this.x * value, this.y * value)
  }

  rot90(): Vector2 {
    return new Vector2(-this.y, this.x)
  }

  distanceTo(that: Vector2): number {
    return that.sub(this).length()
  }

  sqrDistanceTo(that: Vector2): number {
    return that.sub(this).sqrLength()
  }

  lerp(that: Vector2, alpha: number): Vector2 {
    return that.sub(this).scale(alpha).add(this)
  }

  dot(that: Vector2): number {
    return this.x * that.x + this.y * that.y
  }

  array(): [number, number] {
    return [this.x, this.y]
  }
}

class Player {
  position: Vector2
  direction: number

  constructor(position: Vector2, direction: number) {
    this.position = position
    this.direction = direction
  }

  fovRange(): [Vector2, Vector2] {
    const len = Math.tan(FOV * 0.5) * NEAR_CLIPPING_PLANE
    const p = this.position.add(Vector2.fromAngle(this.direction).scale(NEAR_CLIPPING_PLANE))
    const p1 = p.sub(p.sub(this.position).rot90().norm().scale(len))
    const p2 = p.add(p.sub(this.position).rot90().norm().scale(len))

    return [p1, p2]
  }
}

class Color {
  r: number
  g: number
  b: number
  a: number

  constructor(r: number, g: number, b: number, a: number) {
    this.r = r
    this.g = g
    this.b = b
    this.a = a
  }

  static fromImageData(data: Uint8ClampedArray): Color {
    const [r, g, b, a] = data
    return new Color(r / 255, g / 255, b / 255, a / 255)
  }

  static red(): Color {
    return new Color(1, 0, 0, 1)
  }

  static green(): Color {
    return new Color(0, 1, 0, 1)
  }

  static blue(): Color {
    return new Color(0, 0, 1, 1)
  }

  static yellow(): Color {
    return new Color(1, 1, 0, 1)
  }

  static purple(): Color {
    return new Color(1, 0, 1, 1)
  }

  static cyan(): Color {
    return new Color(0, 1, 1, 1)
  }

  brightness(factor: number): Color {
    return new Color(factor * this.r, factor * this.g, factor * this.b, this.a)
  }

  toStyle(): string {
    return `rgba(
      ${Math.floor(this.r * 255)}, 
      ${Math.floor(this.g * 255)}, 
      ${Math.floor(this.b * 255)}, 
      ${this.a}
    )`
  }
}

type Scene = Array<Array<Color | HTMLImageElement | null>>

function canvasSize(ctx: CanvasRenderingContext2D): Vector2 {
  return new Vector2(ctx.canvas.width, ctx.canvas.height)
}

function fillCircle(ctx: CanvasRenderingContext2D, center: Vector2, radius: number) {
  ctx.beginPath()
  ctx.arc(...center.array(), radius, 0, 2 * Math.PI)
  ctx.fill()
}

function strokeLine(ctx: CanvasRenderingContext2D, p1: Vector2, p2: Vector2) {
  ctx.beginPath()
  ctx.moveTo(...p1.array())
  ctx.lineTo(...p2.array())
  ctx.stroke()
}

function snap(x: number, dx: number): number {
  if (dx > 0)
    return Math.ceil(x + EPS)
  if (dx < 0)
    return Math.floor(x - EPS)
  return x
}

function hittingCell(p1: Vector2, p2: Vector2): Vector2 {
  const d = p2.sub(p1)
  return new Vector2(
    Math.floor(p2.x + Math.sign(d.x) * EPS),
    Math.floor(p2.y + Math.sign(d.y) * EPS)
  )
}

function rayStep(p1: Vector2, p2: Vector2): Vector2 {
  // y = k*x + c
  // x = (y - c)/k
  //
  // | y1 = k*x1 + c
  // | y2 = k*x2 + c
  // 
  // dy = y2 - y1
  // dx = x2 - x1
  // c = y1 - k*x1
  // k = dy/dx
  let p3 = p2
  const d = p2.sub(p1)
  if (d.x !== 0) {
    const k = d.y / d.x
    const c = p1.y - k * p1.x
    {
      const x3 = snap(p2.x, d.x)
      const y3 = k * x3 + c
      p3 = new Vector2(x3, y3)
    }
    if (k !== 0) {
      const y3 = snap(p2.y, d.y)
      const x3 = (y3 - c) / k
      const p3t = new Vector2(x3, y3)
      if (p2.sqrDistanceTo(p3) > p2.sqrDistanceTo(p3t))
        p3 = p3t
    }
  } else {
    const y3 = snap(p2.y, d.y)
    const x3 = p2.x
    p3 = new Vector2(x3, y3)
  }

  return p3
}

function insideScene(scene: Scene, p: Vector2): boolean {
  const size = sceneSize(scene)
  return p.x >= 0 && p.x < size.x &&
    p.y >= 0 && p.y < size.y
}

function castRay(scene: Scene, p1: Vector2, p2: Vector2): Vector2 {
  let start = p1
  while (start.sqrDistanceTo(p1) < FAR_CLIPPING_PLANE ** 2) {
    const c = hittingCell(p1, p2)
    if (insideScene(scene, c) && scene[c.y][c.x] !== null)
      break
    const p3 = rayStep(p1, p2)
    p1 = p2;
    p2 = p3;
  }
  return p2;
}

function distancePointToLine(p1: Vector2, p2: Vector2, p0: Vector2) {
  const A = p2.y - p1.y
  const B = p1.x - p2.x
  const C = p2.x * p1.y - p1.x * p2.y

  return Math.abs((A * p0.x + B * p0.y + C) / Math.sqrt(A ** 2 + B ** 2))
}

function sceneSize(scene: Scene): Vector2 {
  const y = scene.length
  let x = Number.MIN_VALUE;

  for (let row of scene) {
    x = Math.max(x, row.length)
  }
  return new Vector2(x, y)
}

function renderMinimap(
  ctx: CanvasRenderingContext2D,
  player: Player,
  position: Vector2,
  size: Vector2,
  scene: Scene
) {
  ctx.save()

  const gridSize = sceneSize(scene)

  ctx.translate(...position.array())
  ctx.scale(...size.div(gridSize).array())

  ctx.fillStyle = "#181818"
  ctx.fillRect(0, 0, ...gridSize.array())

  ctx.lineWidth = 0.06
  for (let y = 0; y < gridSize.y; y++) {
    for (let x = 0; x < gridSize.x; x++) {
      const cell = scene[y][x]
      if (cell instanceof Color) {
        ctx.fillStyle = cell.toStyle()
        ctx.fillRect(x, y, 1, 1)
      }
      else if (cell instanceof HTMLImageElement) {
        ctx.drawImage(cell, x, y, 1, 1)
      }
    }
  }

  ctx.strokeStyle = "#303030"
  for (let x = 0; x <= gridSize.x; x++)
    strokeLine(ctx, new Vector2(x, 0), new Vector2(x, gridSize.y))

  for (let y = 0; y <= gridSize.y; y++)
    strokeLine(ctx, new Vector2(0, y), new Vector2(gridSize.x, y))

  ctx.fillStyle = "magenta"
  fillCircle(ctx, player.position, 0.2)

  ctx.strokeStyle = "magenta"
  const [p1, p2] = player.fovRange()

  strokeLine(ctx, player.position, p1)
  strokeLine(ctx, player.position, p2)
  strokeLine(ctx, p1, p2)
  // if (p2 !== undefined) {
  //   while (true) {
  //     fillCircle(ctx, p2, 0.1)
  //     strokeLine(ctx, p1, p2)

  //     const c = hittingCell(p1, p2)
  //     if (
  //       c.x < 0 || c.x >= gridSize.x ||
  //       c.y < 0 || c.y >= gridSize.y ||
  //       scene[c.y][c.x] !== 0
  //     )
  //       break

  //     const p3 = rayStep(p1, p2)
  //     p1 = p2
  //     p2 = p3
  //   }
  // }

  ctx.restore()
}

function renderScene(ctx: CanvasRenderingContext2D, player: Player, scene: Scene) {
  const stripWidth = Math.ceil(ctx.canvas.width / SCREEN_WIDTH)
  const [r1, r2] = player.fovRange();

  for (let x = 0; x < SCREEN_WIDTH; x++) {
    const p = castRay(scene, player.position, r1.lerp(r2, x / SCREEN_WIDTH))
    const c = hittingCell(player.position, p)
    if (insideScene(scene, c)) {
      const cell = scene[c.y][c.x]

      const v = p.sub(player.position)
      const d = Vector2.fromAngle(player.direction)
      const stripHeight = ctx.canvas.height / v.dot(d) // distancePointToLine(r1,r2,p)

      if (cell instanceof Color) {
        ctx.fillStyle = cell.brightness(1 / v.dot(d)).toStyle()
        ctx.fillRect(x * stripWidth, (ctx.canvas.height - stripHeight) / 2, stripWidth + 1, stripHeight)
      }
      else if (cell instanceof HTMLImageElement) {
        let u = 0
        const t = p.sub(c)
        if ((Math.abs(t.x) < EPS || Math.abs(t.x - 1) < EPS) && t.y > 0)
          u = t.y
        else
          u = t.x
        const txStep = cell.width / SCREEN_WIDTH
        const topTx = (ctx.canvas.height - stripHeight) / 2
        ctx.drawImage(cell,
          u * cell.width,
          0,
          txStep,
          cell.height,
          x * stripWidth,
          topTx,
          stripWidth,
          stripHeight
        )

        // const imageData = ctx.getImageData(x * stripWidth, topTx, 1, stripHeight).data // shading texture
        // console.log(imageData.length/4,stripHeight)
        // for (let y = topTx; y < topTx + stripHeight; y++) {
        //   ctx.fillStyle = Color
        //     .fromImageData(imageData.slice(4 * (y - topTx), 4 * (y - topTx + 1)))
        //     .brightness(1 / v.dot(d))
        //     .toStyle()
        //   ctx.fillRect(x * stripWidth, y, stripWidth, 1)
        // }
      }
    }
  }
}

function renderGame(ctx: CanvasRenderingContext2D, player: Player, scene: Scene) {
  const minimapPosition = canvasSize(ctx).scale(0.03)
  const cellSize = ctx.canvas.width * 0.03
  const minimapSize = sceneSize(scene).scale(cellSize)

  ctx.fillStyle = "#181818"
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  renderScene(ctx, player, scene)
  renderMinimap(ctx, player, minimapPosition, minimapSize, scene)
}

async function loadImageData(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = url
  img.crossOrigin = "anonymous"
  return new Promise((res, rej) => {
    img.onload = () => res(img)
    img.onerror = rej
  })
}

(async () => {
  const forest = await loadImageData('./images/forest.jpg')
  const wall = await loadImageData('./images/wall.jpg')

  const scene: Scene = [
    [forest, wall, Color.cyan(), forest, null, null, null, null, null, null],
    [null, null, null, Color.yellow(), null, null, null, null, null, null],
    [null, Color.red(), Color.green(), Color.blue(), null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, wall, null, null, null, null],
    [wall, wall, wall, null, wall, wall, null, null, null, forest],
    [wall, null, null, null, null, wall, wall, wall, wall, forest],
  ]

  const game = document.getElementById('game') as (HTMLCanvasElement | null);
  if (game === null)
    throw new Error("No canvas with id `game` is found")

  const factor = 100
  game.width = 16 * factor
  game.height = 9 * factor

  const ctx = game.getContext("2d")
  if (ctx === null)
    throw new Error("Context 2D is not supported")

  const player = new Player(
    sceneSize(scene).mul(new Vector2(0.63, 0.63)),
    Math.PI * 1.25
  )
  let movingForward = false
  let movingBackward = false
  let movingLeft = false
  let movingRight = false
  let turningLeft = false
  let turningRight = false

  window.addEventListener("keydown", (e) => {
    if (!e.repeat)
      switch (e.code) {
        case 'KeyW':
          movingForward = true
          break
        case 'KeyS':
          movingBackward = true
          break
        case 'KeyD':
          movingRight = true
          break
        case 'KeyA':
          movingLeft = true
          break
        case 'KeyE':
          turningRight = true
          break
        case 'KeyQ':
          turningLeft = true
          break
      }
  })

  window.addEventListener("keyup", (e) => {
    if (!e.repeat)
      switch (e.code) {
        case 'KeyW':
          movingForward = false
          break
        case 'KeyS':
          movingBackward = false
          break
        case 'KeyD':
          movingRight = false
          break
        case 'KeyA':
          movingLeft = false
          break
        case 'KeyE':
          turningRight = false
          break
        case 'KeyQ':
          turningLeft = false
          break
      }
  })

  let prevTimestamp = 0
  const frame = (timestamp: number) => {
    const deltaTime = (timestamp - prevTimestamp) / 1000
    prevTimestamp = timestamp
    let velocity = Vector2.zero()
    let angularVelocity = 0.0
    if (movingForward)
      velocity = velocity.add(Vector2.fromAngle(player.direction).scale(PLAYER_SPEED))
    if (movingBackward)
      velocity = velocity.sub(Vector2.fromAngle(player.direction).scale(PLAYER_SPEED))
    if (movingLeft)
      velocity = velocity.sub(Vector2.fromAngle(player.direction).scale(PLAYER_SPEED).rot90())
    if (movingRight)
      velocity = velocity.add(Vector2.fromAngle(player.direction).scale(PLAYER_SPEED).rot90())
    if (turningLeft)
      angularVelocity -= Math.PI * 0.5;
    if (turningRight)
      angularVelocity += Math.PI * 0.5;

    player.direction += angularVelocity * deltaTime
    const towards = player.position.add(velocity.scale(deltaTime))
    const cell = new Vector2(Math.floor(towards.x), Math.floor(towards.y))
    if (!insideScene(scene, towards) || scene[cell.y][cell.x] === null)
      player.position = towards
    renderGame(ctx, player, scene)
    window.requestAnimationFrame(frame)
  }
  window.requestAnimationFrame(timestamp => {
    prevTimestamp = timestamp
    window.requestAnimationFrame(frame)
  })
})()

