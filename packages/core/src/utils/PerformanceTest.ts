import { SpatialIndex } from './SpatialIndex';
import type { GridPosition, GridSize, BlockData } from '../types';

/**
 * 성능 테스트: 기존 O(n) vs 새로운 O(1) 충돌 검사 비교
 */
export class PerformanceTest {
  
  /**
   * 기존 방식: 모든 블록을 순회하는 충돌 검사 (O(n))
   */
  static legacyCollisionCheck(
    newPosition: GridPosition,
    newSize: GridSize,
    excludeBlockId: string,
    existingBlocks: readonly BlockData[]
  ): boolean {
    const newEndX = newPosition.x + newSize.width - 1;
    const newEndY = newPosition.y + newSize.height - 1;

    for (const block of existingBlocks) {
      if (block.id === excludeBlockId) continue;

      const existingEndX = block.position.x + block.size.width - 1;
      const existingEndY = block.position.y + block.size.height - 1;

      const horizontalOverlap = !(newPosition.x > existingEndX || newEndX < block.position.x);
      const verticalOverlap = !(newPosition.y > existingEndY || newEndY < block.position.y);

      if (horizontalOverlap && verticalOverlap) {
        return true;
      }
    }

    return false;
  }

  /**
   * 성능 벤치마크 실행
   */
  static runBenchmark(blockCount: number = 100, testIterations: number = 1000): {
    legacy: { time: number; result: boolean[] };
    optimized: { time: number; result: boolean[] };
    speedup: string;
  } {
    console.log(`🚀 성능 테스트 시작: ${blockCount}개 블록, ${testIterations}회 테스트`);

    // 테스트 데이터 생성
    const blocks: BlockData[] = [];
    const spatialIndex = new SpatialIndex();
    
    for (let i = 0; i < blockCount; i++) {
      const block: BlockData = {
        id: `block-${i}`,
        type: 'test',
        position: { 
          x: Math.floor(Math.random() * 20) + 1, 
          y: Math.floor(Math.random() * 20) + 1, 
          zIndex: i + 1 
        },
        size: { 
          width: Math.floor(Math.random() * 3) + 1, 
          height: Math.floor(Math.random() * 3) + 1 
        },
        attributes: {},
        movable: true,
        resizable: true
      };
      blocks.push(block);
      spatialIndex.addBlock(block.id, block.position, block.size);
    }

    // 테스트할 위치들 생성
    const testPositions: Array<{ position: GridPosition; size: GridSize }> = [];
    for (let i = 0; i < testIterations; i++) {
      testPositions.push({
        position: { 
          x: Math.floor(Math.random() * 20) + 1, 
          y: Math.floor(Math.random() * 20) + 1, 
          zIndex: 1 
        },
        size: { 
          width: Math.floor(Math.random() * 3) + 1, 
          height: Math.floor(Math.random() * 3) + 1 
        }
      });
    }

    // 기존 방식 테스트 (O(n))
    console.log('⏱️ 기존 방식 (O(n)) 테스트 중...');
    const legacyStart = performance.now();
    const legacyResults: boolean[] = [];
    
    for (const test of testPositions) {
      const result = this.legacyCollisionCheck(
        test.position, 
        test.size, 
        'test-exclude', 
        blocks
      );
      legacyResults.push(result);
    }
    
    const legacyTime = performance.now() - legacyStart;

    // 최적화된 방식 테스트 (O(1))
    console.log('⚡ 최적화된 방식 (O(1)) 테스트 중...');
    const optimizedStart = performance.now();
    const optimizedResults: boolean[] = [];
    
    for (const test of testPositions) {
      const result = spatialIndex.hasCollisionFast(
        test.position, 
        test.size, 
        'test-exclude'
      );
      optimizedResults.push(result);
    }
    
    const optimizedTime = performance.now() - optimizedStart;

    // 결과 분석
    const speedup = (legacyTime / optimizedTime).toFixed(2);
    
    console.log('📊 성능 테스트 결과:');
    console.log(`   기존 방식: ${legacyTime.toFixed(2)}ms`);
    console.log(`   최적화: ${optimizedTime.toFixed(2)}ms`);
    console.log(`   속도 향상: ${speedup}배`);
    console.log(`   SpatialIndex 통계:`, spatialIndex.getStats());

    return {
      legacy: { time: legacyTime, result: legacyResults },
      optimized: { time: optimizedTime, result: optimizedResults },
      speedup: `${speedup}x`
    };
  }

  /**
   * 다양한 블록 수에 대한 확장성 테스트
   */
  static runScalabilityTest(): void {
    console.log('🎯 확장성 테스트 시작...\n');
    
    const blockCounts = [10, 50, 100, 200, 500];
    const iterations = 500;

    for (const blockCount of blockCounts) {
      const result = this.runBenchmark(blockCount, iterations);
      console.log(`${blockCount}개 블록: ${result.speedup} 속도 향상\n`);
    }
  }
}