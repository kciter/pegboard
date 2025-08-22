import type { ICommand } from './types';

/**
 * TransactionContext: 트랜잭션 실행 중 커맨드들을 수집하는 컨텍스트
 */
export class TransactionContext {
  private commands: ICommand[] = [];
  private _isRolledBack = false;
  private rollbackRequested = false;

  /**
   * 커맨드를 트랜잭션에 추가
   */
  addCommand(command: ICommand): void {
    if (this.rollbackRequested) {
      throw new Error('Cannot add commands after rollback has been requested');
    }
    this.commands.push(command);
  }

  /**
   * 트랜잭션 롤백 요청
   */
  requestRollback(): void {
    this.rollbackRequested = true;
  }

  /**
   * 수집된 모든 커맨드 반환
   */
  getCommands(): ICommand[] {
    return [...this.commands];
  }

  /**
   * 롤백이 요청되었는지 확인
   */
  isRollbackRequested(): boolean {
    return this.rollbackRequested;
  }

  /**
   * 트랜잭션이 롤백되었는지 확인
   */
  isRolledBack(): boolean {
    return this._isRolledBack;
  }

  /**
   * 롤백 상태 설정 (내부용)
   */
  setRolledBack(rolledBack: boolean): void {
    this._isRolledBack = rolledBack;
  }

  /**
   * 커맨드 개수 반환
   */
  getCommandCount(): number {
    return this.commands.length;
  }

  /**
   * 트랜잭션 초기화
   */
  reset(): void {
    this.commands = [];
    this._isRolledBack = false;
    this.rollbackRequested = false;
  }
}