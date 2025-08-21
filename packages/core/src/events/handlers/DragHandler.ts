import type { IDragHandler, PointerEvent, DragContext, InteractionContext } from '../types';
import type { BlockManager } from '../../managers/BlockManager';
import type { SelectionHandler } from './SelectionHandler';
import type { Grid } from '../../Grid';
import { EventEmitter } from '../../EventEmitter';

/**
 * DragHandler: 블록 드래그 및 리사이즈 기능을 처리
 * - 블록 이동 (move)
 * - 블록 크기 조정 (resize)
 * - 그룹 드래그 지원
 * - 실시간 미리보기
 */
export class DragHandler extends EventEmitter implements IDragHandler {
  private isActive = false;
  private currentContext: DragContext | null = null;

  constructor(
    private container: HTMLElement,
    private blockManager: BlockManager,
    private selectionHandler: SelectionHandler,
    private grid: Grid,
    private getConfiguration: () => {
      allowOverlap: boolean;
      dragReflow: boolean;
    },
    private reflowCallback?: (
      anchorBlockId: string,
      newPosition: any,
      strategy?: any,
    ) => Promise<boolean>,
    private moveBlockCallback?: (blockId: string, from: any, to: any) => Promise<void>,
    private rollbackCallback?: (blockId: string, originalPosition: any) => Promise<void>,
  ) {
    super();
  }

  onPointerDown(event: PointerEvent, context: InteractionContext): boolean {
    // 블록 요소가 아니면 처리하지 않음
    if (!context.blockId) return false;

    // 드래그/리사이즈가 허용되지 않으면 선택만 처리
    if (!context.allowDrag && !context.allowResize) {
      return false;
    }

    return true; // 실제 시작은 startDrag에서
  }

  onPointerMove(event: PointerEvent): boolean {
    if (!this.isActive || !this.currentContext) return false;

    this.updateDrag(event, this.currentContext);
    return true;
  }

  onPointerUp(event: PointerEvent): boolean {
    if (!this.isActive || !this.currentContext) return false;

    this.endDrag(event, this.currentContext);
    return true;
  }

  startDrag(event: PointerEvent, context: DragContext): void {
    this.isActive = true;
    this.currentContext = context;

    // 드래그 대상 블록 준비
    this.prepareDragTargets(context);

    // 시각적 피드백 시작
    this.startVisualFeedback(context);

    (this as any).emit('drag:started', {
      type: context.type,
      blockId: context.blockId,
      isGroupDrag: context.isGroupDrag,
      selectedIds: context.selectedIds,
    });
  }

  updateDrag(event: PointerEvent, context: DragContext): void {
    if (!this.isActive) return;

    // 마우스 이동량 계산
    const deltaX = event.position.x - context.startPosition.x;
    const deltaY = event.position.y - context.startPosition.y;

    if (context.type === 'move') {
      this.updateMove(deltaX, deltaY, context);
    } else if (context.type === 'resize') {
      this.updateResize(deltaX, deltaY, context);
    }

    (this as any).emit('drag:updated', {
      type: context.type,
      delta: { x: deltaX, y: deltaY },
      blockId: context.blockId,
    });
  }

  endDrag(event: PointerEvent, context: DragContext): void {
    if (!this.isActive) return;

    // 최종 위치/크기 확정
    const hasTransition = this.finalizeDrag(context);

    // FLIP 애니메이션이 없는 경우에만 즉시 정리
    // FLIP 애니메이션이 있는 경우 TransitionManager에서 애니메이션 완료 후 정리
    if (!hasTransition) {
      this.cleanupVisualFeedback(context);
    }

    this.isActive = false;
    this.currentContext = null;

    (this as any).emit('drag:ended', {
      type: context.type,
      blockId: context.blockId,
      isGroupDrag: context.isGroupDrag,
    });
  }

  cancelDrag(): void {
    if (!this.isActive || !this.currentContext) return;

    // 드래그 취소 - 원래 위치/크기로 복원
    this.restoreOriginalState(this.currentContext);

    // 시각적 피드백 정리
    this.cleanupVisualFeedback(this.currentContext);

    this.isActive = false;
    this.currentContext = null;

    (this as any).emit('drag:cancelled');
  }

  // Private methods

  private prepareDragTargets(context: DragContext): void {
    const block = this.blockManager.getBlockInstance(context.blockId);
    if (!block) return;

    // 드래그 중 스타일 클래스 추가
    if (context.type === 'move') {
      block.getElement().classList.add('pegboard-block-dragging');
    } else if (context.type === 'resize') {
      block.getElement().classList.add('pegboard-block-resizing');
    }

    // 그룹 드래그인 경우 선택된 모든 블록에 적용
    if (context.isGroupDrag) {
      for (const blockId of context.selectedIds) {
        if (blockId === context.blockId) continue;
        const selectedBlock = this.blockManager.getBlockInstance(blockId);
        if (selectedBlock) {
          selectedBlock.getElement().classList.add('pegboard-block-dragging');
        }
      }
    }
  }

  private updateMove(deltaX: number, deltaY: number, context: DragContext): void {
    const block = this.blockManager.getBlockInstance(context.blockId);
    if (!block) return;

    // 실시간 transform 적용 (부드러운 이동) - Move의 경우에만
    const element = block.getElement();
    element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    element.style.zIndex = '9999'; // 드래그 중에는 최상위로

    // 그룹 드래그인 경우
    if (context.isGroupDrag) {
      for (const blockId of context.selectedIds) {
        if (blockId === context.blockId) continue;
        const selectedBlock = this.blockManager.getBlockInstance(blockId);
        if (selectedBlock) {
          const selectedElement = selectedBlock.getElement();
          selectedElement.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
          selectedElement.style.zIndex = '9998';
        }
      }
    }

    // 픽셀 단위 이동량을 그리드 단위로 변환하여 미리보기 표시
    const gridDelta = this.pixelsToGridDelta(deltaX, deltaY);
    const blockData = block.getData();
    const newGridPosition = this.clampPositionToGrid(
      {
        x: context.startGridPosition.x + gridDelta.x,
        y: context.startGridPosition.y + gridDelta.y,
        zIndex: context.startGridPosition.zIndex,
      },
      blockData.size,
    );

    // 위치 유효성 검사
    const config = this.getConfiguration();
    let isValidPosition = this.grid.isValidGridPosition(newGridPosition, blockData.size);

    if (!config.allowOverlap) {
      const existingBlocks = this.blockManager.getAllBlocks();
      const hasCollision = this.grid.checkGridCollision(
        newGridPosition,
        blockData.size,
        context.blockId,
        existingBlocks,
      );

      if (hasCollision) {
        isValidPosition = false;
      }
    }

    // 그룹 드래그인 경우 다른 선택된 블록들도 함께 이동
    if (context.isGroupDrag) {
      this.updateGroupPositions(context, gridDelta);
    }

    // PreviewManager를 통해 미리보기 표시
    (this as any).emit('drag:preview', {
      position: newGridPosition,
      size: blockData.size,
      valid: isValidPosition,
      blockId: context.blockId,
      isGroupDrag: context.isGroupDrag,
      selectedIds: context.selectedIds,
    });

    // 그룹 드래그인 경우 각 선택된 블록의 미리보기도 개별 이벤트로 발생
    if (context.isGroupDrag) {
      for (const blockId of context.selectedIds) {
        if (blockId === context.blockId) continue;

        const selectedBlock = this.blockManager.getBlockInstance(blockId);
        if (!selectedBlock) continue;

        const selectedBlockData = selectedBlock.getData();
        const selectedNewPosition = this.clampPositionToGrid(
          {
            x: selectedBlockData.position.x + gridDelta.x,
            y: selectedBlockData.position.y + gridDelta.y,
            zIndex: selectedBlockData.position.zIndex || 1,
          },
          selectedBlockData.size,
        );

        // 개별 블록의 위치 유효성 검사
        let selectedValid = this.grid.isValidGridPosition(
          selectedNewPosition,
          selectedBlockData.size,
        );
        if (!config.allowOverlap && selectedValid) {
          const existingBlocks = this.blockManager.getAllBlocks();
          const hasCollision = this.grid.checkGridCollision(
            selectedNewPosition,
            selectedBlockData.size,
            blockId,
            existingBlocks,
          );

          if (hasCollision) {
            selectedValid = false;
          }
        }

        (this as any).emit('drag:preview:group', {
          position: selectedNewPosition,
          size: selectedBlockData.size,
          valid: selectedValid,
          blockId: blockId,
          isPrimary: false,
        });
      }
    }
  }

  private updateResize(deltaX: number, deltaY: number, context: DragContext): void {
    if (!context.resizeDirection) return;

    // 픽셀 단위 변화를 그리드 단위로 변환
    const gridDelta = this.pixelsToGridDelta(deltaX, deltaY);

    // 방향별 위치와 크기 계산
    const resizeResult = this.calculateResizeByDirection(
      context.resizeDirection,
      gridDelta,
      context.startGridPosition,
      context.startGridSize,
    );

    // 크기 제약 확인
    const block = this.blockManager.getBlock(context.blockId);
    if (!block) return;

    const clampedSize = this.clampSize(resizeResult.size, block.constraints);

    // 크기가 실제로 제약되었는지 확인
    const sizeWasClamped =
      clampedSize.width !== resizeResult.size.width ||
      clampedSize.height !== resizeResult.size.height;

    // 크기가 제약으로 인해 변경되었다면 위치도 재계산, 그렇지 않으면 원래 결과 사용
    const finalResult = sizeWasClamped
      ? this.adjustPositionForClampedSize(
          context.resizeDirection,
          resizeResult.position,
          resizeResult.size,
          clampedSize,
          context.startGridPosition,
          context.startGridSize,
        )
      : { position: resizeResult.position, size: clampedSize };

    // 새 위치와 크기로 유효성 재검사
    let isValid = this.grid.isValidGridPosition(finalResult.position, finalResult.size);
    
    // 충돌 검사 (allowOverlap이 false인 경우)
    if (isValid) {
      const config = this.getConfiguration();
      if (!config.allowOverlap) {
        const existingBlocks = this.blockManager.getAllBlocks();
        const hasCollision = this.grid.checkGridCollision(
          finalResult.position,
          finalResult.size,
          context.blockId,
          existingBlocks,
        );
        if (hasCollision) {
          isValid = false;
        }
      }
    }

    // 유효하든 유효하지 않든 항상 프리뷰 표시 (룰 위반 상태도 보여줌)
    if (isValid) {
      // 최종 위치와 크기를 context에 저장 (finalizeDrag에서 사용)
      context.finalPosition = finalResult.position;
      context.finalSize = finalResult.size;
    } else {
      // 유효하지 않은 경우 context 정리
      context.finalPosition = undefined;
      context.finalSize = undefined;
    }

    // 리사이즈는 실제 블록을 건드리지 않고 프리뷰만 표시
    (this as any).emit('drag:preview', {
      position: finalResult.position,
      size: finalResult.size,
      valid: isValid,
      blockId: context.blockId,
      isGroupDrag: false,
      selectedIds: [context.blockId],
      type: 'resize',
      resizeDirection: context.resizeDirection,
    });
  }

  private finalizeDrag(context: DragContext): boolean {
    const block = this.blockManager.getBlockInstance(context.blockId);
    if (!block) return false;

    if (context.type === 'move') {
      // Transform에서 최종 위치 계산
      const element = block.getElement();
      const transform = element.style.transform;

      if (transform) {
        // transform: translate(deltaX, deltaY) 파싱
        const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (match && match[1] && match[2]) {
          const deltaX = parseFloat(match[1]);
          const deltaY = parseFloat(match[2]);

          // 그리드 델타 계산
          const gridDelta = this.pixelsToGridDelta(deltaX, deltaY);
          const finalPosition = this.clampPositionToGrid(
            {
              x: context.startGridPosition.x + gridDelta.x,
              y: context.startGridPosition.y + gridDelta.y,
              zIndex: (context.startGridPosition as any).zIndex || 1,
            },
            block.getData().size,
          );

          // 위치 유효성 재검사 후 최종 적용
          let isValid = this.grid.isValidGridPosition(finalPosition, block.getData().size);
          
          // 주 블록의 충돌 검사
          const config = this.getConfiguration();
          if (isValid && !config.allowOverlap) {
            const existingBlocks = this.blockManager.getAllBlocks();
            const hasCollision = this.grid.checkGridCollision(
              finalPosition,
              block.getData().size,
              context.blockId,
              existingBlocks,
            );
            if (hasCollision) {
              isValid = false;
            }
          }
          
          // 그룹 드래그인 경우 모든 블록의 유효성도 검사
          if (isValid && context.isGroupDrag) {
            for (const blockId of context.selectedIds) {
              if (blockId === context.blockId) continue;
              const selectedBlock = this.blockManager.getBlockInstance(blockId);
              if (selectedBlock) {
                const selectedData = selectedBlock.getData();
                const selectedFinalPosition = this.clampPositionToGrid(
                  {
                    x: selectedData.position.x + gridDelta.x,
                    y: selectedData.position.y + gridDelta.y,
                    zIndex: selectedData.position.zIndex || 1,
                  },
                  selectedData.size,
                );
                
                // 개별 블록의 유효성 검사
                const selectedValid = this.grid.isValidGridPosition(selectedFinalPosition, selectedData.size);
                if (!selectedValid) {
                  isValid = false;
                  break;
                }
                
                // 충돌 검사 (allowOverlap이 false인 경우)
                if (!config.allowOverlap) {
                  const existingBlocks = this.blockManager.getAllBlocks();
                  const hasCollision = this.grid.checkGridCollision(
                    selectedFinalPosition,
                    selectedData.size,
                    blockId,
                    existingBlocks,
                  );
                  if (hasCollision) {
                    isValid = false;
                    break;
                  }
                }
              }
            }
          }

          if (isValid) {
            // FLIP 애니메이션 사용 여부 확인
            const useTransition = !!this.moveBlockCallback;

            // FLIP 애니메이션을 위해 moveBlockCallback 사용
            const originalPosition = context.startGridPosition;
            if (this.moveBlockCallback) {
              this.moveBlockCallback(context.blockId, originalPosition, finalPosition).catch(
                (error) => {
                  console.warn('Move with transition failed, falling back to direct move:', error);
                  this.blockManager.moveBlock(context.blockId, finalPosition);
                },
              );
            } else {
              // 콜백이 없으면 기존 방식
              this.blockManager.moveBlock(context.blockId, finalPosition);
            }

            // 그룹 드래그인 경우
            if (context.isGroupDrag) {
              for (const blockId of context.selectedIds) {
                if (blockId === context.blockId) continue;
                const selectedBlock = this.blockManager.getBlockInstance(blockId);
                if (selectedBlock) {
                  const selectedData = selectedBlock.getData();
                  const selectedFinalPosition = this.clampPositionToGrid(
                    {
                      x: selectedData.position.x + gridDelta.x,
                      y: selectedData.position.y + gridDelta.y,
                      zIndex: selectedData.position.zIndex || 1,
                    },
                    selectedData.size,
                  );

                  // 그룹 드래그도 FLIP 애니메이션 적용 (시작 위치 기준)
                  const selectedOriginalPosition = selectedData.position;
                  if (this.moveBlockCallback) {
                    this.moveBlockCallback(
                      blockId,
                      selectedOriginalPosition,
                      selectedFinalPosition,
                    ).catch((error) => {
                      console.warn(
                        'Group move with transition failed, falling back to direct move:',
                        error,
                      );
                      this.blockManager.moveBlock(blockId, selectedFinalPosition);
                    });
                  } else {
                    this.blockManager.moveBlock(blockId, selectedFinalPosition);
                  }
                }
              }
            }

            // 리플로우 실행 (드래그 완료 후)
            const config = this.getConfiguration();
            if (config.dragReflow && this.reflowCallback) {
              this.reflowCallback(context.blockId, finalPosition).catch((error) => {
                console.warn('Reflow failed:', error);
              });
            }

            return useTransition;
          } else {
            // 유효하지 않은 위치로 이동하려 한 경우 FLIP 애니메이션으로 원래 위치로 복원
            console.log('DragHandler: Invalid position, rolling back with FLIP animation to original position');
            
            // FLIP 애니메이션 사용 여부 확인 (rollback 시에는 rollbackCallback 사용)
            const useTransition = !!this.rollbackCallback;
            
            if (this.rollbackCallback) {
              console.log('DragHandler: Using rollback-specific FLIP animation to:', context.startGridPosition);
              console.log('DragHandler: Element current transform:', element.style.transform);
              
              // 🔧 rollback 전용 콜백 사용 - TransitionManager의 rollback 메서드 활용
              this.rollbackCallback(context.blockId, context.startGridPosition).catch(error => {
                console.warn('Rollback with transition failed, falling back to direct restore:', error);
                // 실패 시 즉시 복원
                element.style.transform = '';
                element.style.zIndex = '';
                this.updateBlockPosition(context.blockId, context.startGridPosition, false);
              });
            } else {
              // 콜백이 없으면 즉시 복원
              const element = block.getElement();
              element.style.transform = '';
              element.style.zIndex = '';
              this.updateBlockPosition(context.blockId, context.startGridPosition, false);
            }

            // 그룹 드래그인 경우 모든 선택된 블록도 FLIP 애니메이션으로 복원
            if (context.isGroupDrag && context.startGroupPositions) {
              for (const blockId of context.selectedIds) {
                if (blockId === context.blockId) continue;
                const selectedBlock = this.blockManager.getBlockInstance(blockId);
                const originalPosition = context.startGroupPositions.get(blockId);
                if (selectedBlock && originalPosition) {
                  const selectedData = selectedBlock.getData();
                  // 실제 드래그된 위치 계산 (clamp 없이)
                  const selectedActualPosition = {
                    x: selectedData.position.x + gridDelta.x,
                    y: selectedData.position.y + gridDelta.y,
                    zIndex: selectedData.position.zIndex || 1,
                  };
                  
                  console.log('DragHandler: Group rollback FLIP animation - current transform state, target:', originalPosition);
                  
                  if (this.rollbackCallback) {
                    // 🔧 그룹 블록도 rollback 전용 콜백 사용
                    this.rollbackCallback(blockId, originalPosition).catch(error => {
                      console.warn('Group rollback with transition failed, falling back to direct restore:', error);
                      // 실패 시 즉시 복원
                      const selectedElement = selectedBlock.getElement();
                      selectedElement.style.transform = '';
                      selectedElement.style.zIndex = '';
                      this.updateBlockPosition(blockId, originalPosition, false);
                    });
                  } else {
                    // 콜백이 없으면 즉시 복원
                    const selectedElement = selectedBlock.getElement();
                    selectedElement.style.transform = '';
                    selectedElement.style.zIndex = '';
                    this.updateBlockPosition(blockId, originalPosition, false);
                  }
                }
              }
            }

            return useTransition; // 롤백도 FLIP 애니메이션 적용
          }
        }
      }

      return false; // transform이 없는 경우
    } else if (context.type === 'resize' && context.resizeDirection) {
      // 리사이즈의 경우 context에 저장된 최종 위치와 크기를 적용
      if (context.finalPosition && context.finalSize) {
        // 유효한 리사이즈 - 적용
        console.log('DragHandler: Applying valid resize', { 
          finalPosition: context.finalPosition, 
          finalSize: context.finalSize 
        });
        
        // 위치가 변경된 리사이즈 방향인 경우 위치도 업데이트
        const directionsWithPositionChange = ['nw', 'ne', 'sw', 'n', 'w'];
        if (directionsWithPositionChange.includes(context.resizeDirection)) {
          this.blockManager.moveBlock(context.blockId, context.finalPosition);
        }

        this.blockManager.resizeBlock(context.blockId, context.finalSize);
        return false; // 리사이즈는 현재 FLIP 애니메이션 미지원
      } else {
        // 유효하지 않은 리사이즈 - 원래 크기/위치로 rollback
        console.log('DragHandler: Invalid resize, rolling back to original size/position');
        
        // 원래 위치와 크기로 복원
        this.blockManager.moveBlock(context.blockId, context.startGridPosition);
        this.blockManager.resizeBlock(context.blockId, context.startGridSize);
        return false;
      }
    }

    return false;
  }

  private restoreOriginalState(context: DragContext): void {
    // 원래 위치/크기로 복원
    if (context.type === 'move') {
      // 주 드래그 블록 복원
      this.updateBlockPosition(context.blockId, context.startGridPosition, false);

      if (context.isGroupDrag) {
        // 그룹 멤버들도 원래 위치로 복원
        for (const blockId of context.selectedIds) {
          if (blockId === context.blockId) continue;
          const block = this.blockManager.getBlockInstance(blockId);
          if (block) {
            const blockData = block.getData();
            // 현재 위치가 원래 위치가 아니라면 복원
            this.updateBlockPosition(blockId, blockData.position, false);
          }
        }
      }
    } else if (context.type === 'resize') {
      this.updateBlockSize(context.blockId, context.startGridSize, false);
    }
  }

  private startVisualFeedback(context: DragContext): void {
    // 드래그 중 컨테이너에 클래스 추가
    this.container.classList.add('pegboard-dragging');

    // Move 드래그인 경우에만 실제 블록에 시각적 효과 적용
    if (context.type === 'move') {
      const block = this.blockManager.getBlockInstance(context.blockId);
      if (block) {
        const element = block.getElement();
        element.style.willChange = 'transform';
        element.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
      }

      // 그룹 드래그인 경우 선택된 모든 블록에 효과 적용
      if (context.isGroupDrag) {
        for (const blockId of context.selectedIds) {
          if (blockId === context.blockId) continue;
          const selectedBlock = this.blockManager.getBlockInstance(blockId);
          if (selectedBlock) {
            const selectedElement = selectedBlock.getElement();
            selectedElement.style.willChange = 'transform';
            selectedElement.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
          }
        }
      }
    }
    // Resize의 경우 실제 블록은 건드리지 않고 프리뷰만 표시
  }

  private cleanupVisualFeedback(context: DragContext): void {
    // 컨테이너 드래그 클래스 제거
    this.container.classList.remove('pegboard-dragging');

    // Move 드래그인 경우에만 실제 블록 스타일 정리
    if (context.type === 'move') {
      const block = this.blockManager.getBlockInstance(context.blockId);
      if (block) {
        const element = block.getElement();
        element.classList.remove('pegboard-block-dragging');
        element.style.transform = '';
        element.style.zIndex = '';
        element.style.willChange = '';
        element.style.boxShadow = '';
      }

      // 그룹 드래그 정리
      if (context.isGroupDrag) {
        for (const blockId of context.selectedIds) {
          if (blockId === context.blockId) continue;
          const selectedBlock = this.blockManager.getBlockInstance(blockId);
          if (selectedBlock) {
            const selectedElement = selectedBlock.getElement();
            selectedElement.classList.remove('pegboard-block-dragging');
            selectedElement.style.transform = '';
            selectedElement.style.zIndex = '';
            selectedElement.style.willChange = '';
            selectedElement.style.boxShadow = '';
          }
        }
      }
    }

    // Resize의 경우 블록 클래스만 정리
    if (context.type === 'resize') {
      const block = this.blockManager.getBlockInstance(context.blockId);
      if (block) {
        block.getElement().classList.remove('pegboard-block-resizing');
      }
    }
  }

  private updateBlockPosition(
    blockId: string,
    position: { x: number; y: number; zIndex?: number },
    isPreview: boolean,
  ): void {
    const block = this.blockManager.getBlockInstance(blockId);
    if (!block) return;

    // 미리보기 모드에서는 DOM만 업데이트, 확정 모드에서는 데이터도 업데이트
    const positionWithZIndex = {
      x: position.x,
      y: position.y,
      zIndex: position.zIndex ?? 1,
    };

    if (isPreview) {
      block.setPosition(positionWithZIndex);
    } else {
      this.blockManager.moveBlock(blockId, positionWithZIndex);
    }
  }

  private updateBlockSize(
    blockId: string,
    size: { width: number; height: number },
    isPreview: boolean,
  ): void {
    const block = this.blockManager.getBlockInstance(blockId);
    if (!block) return;

    if (isPreview) {
      block.setSize(size);
    } else {
      this.blockManager.resizeBlock(blockId, size);
    }
  }

  private updateGroupPositions(context: DragContext, gridDelta: { x: number; y: number }): void {
    if (!context.isGroupDrag) return;

    // 각 선택된 블록의 시작 위치에 delta를 적용 (변형되지 않은 원래 위치 기준)
    for (const blockId of context.selectedIds) {
      if (blockId === context.blockId) continue; // 주 드래그 블록은 이미 처리됨

      const block = this.blockManager.getBlockInstance(blockId);
      if (!block) continue;

      // transform을 제거하여 원래 위치 확보
      const element = block.getElement();
      const originalTransform = element.style.transform;
      element.style.transform = '';

      const blockData = block.getData();
      const newGridPosition = this.clampPositionToGrid(
        {
          x: blockData.position.x + gridDelta.x,
          y: blockData.position.y + gridDelta.y,
          zIndex: blockData.position.zIndex || 1,
        },
        blockData.size,
      );

      // 위치 유효성 검사
      const config = this.getConfiguration();
      let isValidPosition = this.grid.isValidGridPosition(newGridPosition, blockData.size);

      if (!config.allowOverlap && isValidPosition) {
        const existingBlocks = this.blockManager.getAllBlocks();
        const hasCollision = this.grid.checkGridCollision(
          newGridPosition,
          blockData.size,
          blockId,
          existingBlocks,
        );

        if (hasCollision) {
          isValidPosition = false;
        }
      }

      // 유효한 위치인 경우에만 미리보기 업데이트
      if (isValidPosition) {
        this.updateBlockPosition(blockId, newGridPosition, true);
      }

      // 원래 transform 복원
      element.style.transform = originalTransform;
    }
  }

  private pixelsToGridDelta(deltaX: number, deltaY: number): { x: number; y: number } {
    const gridConfig = this.grid.getConfig();
    const containerRect = this.container.getBoundingClientRect();

    // 컨테이너 크기 기반으로 그리드 셀 크기 계산
    const cellWidth =
      (containerRect.width - gridConfig.gap * (gridConfig.columns - 1)) / gridConfig.columns;
    const cellHeight = gridConfig.rowHeight + gridConfig.gap;

    return {
      x: Math.round(deltaX / (cellWidth + gridConfig.gap)),
      y: Math.round(deltaY / cellHeight),
    };
  }

  private clampSize(
    size: { width: number; height: number },
    constraints?: any,
  ): { width: number; height: number } {
    const result = { ...size };

    if (constraints) {
      if (constraints.minWidth !== undefined) {
        result.width = Math.max(constraints.minWidth, result.width);
      }
      if (constraints.maxWidth !== undefined) {
        result.width = Math.min(constraints.maxWidth, result.width);
      }
      if (constraints.minHeight !== undefined) {
        result.height = Math.max(constraints.minHeight, result.height);
      }
      if (constraints.maxHeight !== undefined) {
        result.height = Math.min(constraints.maxHeight, result.height);
      }
    }

    // 그리드 범위 내로 제한
    const gridConfig = this.grid.getConfig();
    result.width = Math.max(1, Math.min(result.width, gridConfig.columns));
    if (gridConfig.rows && gridConfig.rows > 0) {
      result.height = Math.max(1, Math.min(result.height, gridConfig.rows));
    }

    return result;
  }

  // 리사이즈 방향별 계산 메서드들

  private calculateResizeByDirection(
    direction: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e',
    gridDelta: { x: number; y: number },
    startPosition: { x: number; y: number },
    startSize: { width: number; height: number },
  ): {
    position: { x: number; y: number; zIndex: number };
    size: { width: number; height: number };
  } {
    const newPosition = { x: startPosition.x, y: startPosition.y, zIndex: 1 };
    const newSize = { width: startSize.width, height: startSize.height };

    switch (direction) {
      case 'se': // South-East: 오른쪽 아래
        newSize.width = Math.max(1, startSize.width + gridDelta.x);
        newSize.height = Math.max(1, startSize.height + gridDelta.y);
        break;

      case 'nw': // North-West: 왼쪽 위
        newSize.width = Math.max(1, startSize.width - gridDelta.x);
        newSize.height = Math.max(1, startSize.height - gridDelta.y);
        newPosition.x = Math.max(0, startPosition.x + gridDelta.x);
        newPosition.y = Math.max(0, startPosition.y + gridDelta.y);
        break;

      case 'ne': // North-East: 오른쪽 위
        newSize.width = Math.max(1, startSize.width + gridDelta.x);
        newSize.height = Math.max(1, startSize.height - gridDelta.y);
        newPosition.y = Math.max(0, startPosition.y + gridDelta.y);
        break;

      case 'sw': // South-West: 왼쪽 아래
        newSize.width = Math.max(1, startSize.width - gridDelta.x);
        newSize.height = Math.max(1, startSize.height + gridDelta.y);
        newPosition.x = Math.max(0, startPosition.x + gridDelta.x);
        break;

      case 'n': // North: 위쪽
        newSize.height = Math.max(1, startSize.height - gridDelta.y);
        newPosition.y = Math.max(0, startPosition.y + gridDelta.y);
        break;

      case 's': // South: 아래쪽
        newSize.height = Math.max(1, startSize.height + gridDelta.y);
        break;

      case 'w': // West: 왼쪽
        newSize.width = Math.max(1, startSize.width - gridDelta.x);
        newPosition.x = Math.max(0, startPosition.x + gridDelta.x);
        break;

      case 'e': // East: 오른쪽
        newSize.width = Math.max(1, startSize.width + gridDelta.x);
        break;
    }

    return { position: newPosition, size: newSize };
  }

  private adjustPositionForClampedSize(
    direction: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e',
    calculatedPosition: { x: number; y: number; zIndex: number },
    _originalSize: { width: number; height: number },
    clampedSize: { width: number; height: number },
    startPosition: { x: number; y: number },
    startSize: { width: number; height: number },
  ): {
    position: { x: number; y: number; zIndex: number };
    size: { width: number; height: number };
  } {
    const adjustedPosition = { ...calculatedPosition };

    // 크기가 제약으로 인해 변경된 경우, 고정된 모서리 기준으로 위치 재조정

    switch (direction) {
      case 'nw': // North-West: 오른쪽 아래 모서리 고정
        adjustedPosition.x = startPosition.x + startSize.width - clampedSize.width;
        adjustedPosition.y = startPosition.y + startSize.height - clampedSize.height;
        break;

      case 'ne': // North-East: 왼쪽 아래 모서리 고정
        adjustedPosition.y = startPosition.y + startSize.height - clampedSize.height;
        break;

      case 'sw': // South-West: 오른쪽 위 모서리 고정
        adjustedPosition.x = startPosition.x + startSize.width - clampedSize.width;
        break;

      case 'n': // North: 아래 모서리 고정
        adjustedPosition.y = startPosition.y + startSize.height - clampedSize.height;
        break;

      case 'w': // West: 오른쪽 모서리 고정
        adjustedPosition.x = startPosition.x + startSize.width - clampedSize.width;
        break;

      // se, s, e는 위치 조정 불필요 (고정 모서리가 시작점)
    }

    // 위치가 음수가 되지 않도록 보정
    adjustedPosition.x = Math.max(0, adjustedPosition.x);
    adjustedPosition.y = Math.max(0, adjustedPosition.y);

    return { position: adjustedPosition, size: clampedSize };
  }

  private clampPositionToGrid(
    position: { x: number; y: number; zIndex: number },
    size: { width: number; height: number },
  ): { x: number; y: number; zIndex: number } {
    const gridConfig = this.grid.getConfig();

    // X 좌표 제한: 1 ~ (columns - width + 1)
    const minX = 1;
    const maxX = Math.max(1, gridConfig.columns - size.width + 1);

    // Y 좌표 제한: 1 ~ (rows - height + 1), unboundedRows면 하한만 체크
    const minY = 1;
    let maxY = Infinity;

    const hasRowLimit = gridConfig.rows && gridConfig.rows > 0 && !this.grid.getUnboundedRows();
    if (hasRowLimit) {
      maxY = Math.max(1, gridConfig.rows! - size.height + 1);
    }

    return {
      x: Math.max(minX, Math.min(maxX, position.x)),
      y: Math.max(minY, Math.min(maxY, position.y)),
      zIndex: position.zIndex,
    };
  }

  // 상태 조회
  isDragActive(): boolean {
    return this.isActive;
  }

  getCurrentDragType(): 'move' | 'resize' | null {
    return this.currentContext?.type || null;
  }
}
