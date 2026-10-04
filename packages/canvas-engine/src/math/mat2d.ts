/**
 * 2D Affine Matrix
 * [ a  c  tx ]
 * [ b  d  ty ]
 * [ 0  0  1  ]
 */
import { Point, TransformMatrix } from '@alignify/shared-types';
import { Vec2 } from './vec2';

export class Mat2D implements TransformMatrix {
  constructor(
    public readonly a: number = 1,
    public readonly b: number = 0,
    public readonly c: number = 0,
    public readonly d: number = 1,
    public readonly tx: number = 0,
    public readonly ty: number = 0
  ) {}

  static identity(): Mat2D {
    return new Mat2D(1, 0, 0, 1, 0, 0);
  }

  static translation(x: number, y: number): Mat2D {
    return new Mat2D(1, 0, 0, 1, x, y);
  }

  static scale(sx: number, sy: number = sx): Mat2D {
    return new Mat2D(sx, 0, 0, sy, 0, 0);
  }

  static rotation(angleRad: number): Mat2D {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return new Mat2D(cos, sin, -sin, cos, 0, 0);
  }

  multiply(other: Mat2D): Mat2D {
    return new Mat2D(
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.tx + this.c * other.ty + this.tx,
      this.b * other.tx + this.d * other.ty + this.ty
    );
  }

  translate(x: number, y: number): Mat2D {
    return this.multiply(Mat2D.translation(x, y));
  }

  rotate(angleRad: number): Mat2D {
    return this.multiply(Mat2D.rotation(angleRad));
  }

  scaleBy(sx: number, sy: number = sx): Mat2D {
    return this.multiply(Mat2D.scale(sx, sy));
  }

  transformPoint(p: Point): Vec2 {
    return new Vec2(
      this.a * p.x + this.c * p.y + this.tx,
      this.b * p.x + this.d * p.y + this.ty
    );
  }

  invert(): Mat2D | null {
    const det = this.a * this.d - this.b * this.c;
    if (Math.abs(det) < 1e-10) {
      return null;
    }
    const invDet = 1 / det;
    return new Mat2D(
      this.d * invDet,
      -this.b * invDet,
      -this.c * invDet,
      this.a * invDet,
      (this.c * this.ty - this.d * this.tx) * invDet,
      (this.b * this.tx - this.a * this.ty) * invDet
    );
  }

  applyToContext(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(this.a, this.b, this.c, this.d, this.tx, this.ty);
  }
}
