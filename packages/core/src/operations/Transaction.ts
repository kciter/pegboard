import type { ICommand, IOperation, OperationContext, OperationResult } from './types';
import { TransactionContext } from './TransactionContext';
import { BatchOperation } from './operations/BatchOperation';
import type { CommandRunner } from './CommandRunner';

/**
 * Transaction: 여러 커맨드를 하나의 원자적 작업으로 실행하는 트랜잭션
 */
export class Transaction {
  private context: TransactionContext;
  private commandRunner: CommandRunner;
  private operationContext: OperationContext;

  constructor(commandRunner: CommandRunner, operationContext: OperationContext) {
    this.context = new TransactionContext();
    this.commandRunner = commandRunner;
    this.operationContext = operationContext;
  }

  /**
   * 트랜잭션 실행
   * @param fn 트랜잭션 내에서 실행할 함수 (rollback 함수를 파라미터로 받음)
   * @returns 트랜잭션 성공 여부
   */
  async execute(
    fn: (rollback: () => void) => Promise<void> | void,
  ): Promise<{ success: boolean; result?: OperationResult; error?: string }> {
    // 트랜잭션 컨텍스트 초기화
    this.context.reset();

    // rollback 함수 정의
    const rollback = () => {
      this.context.requestRollback();
    };

    try {
      // 사용자 함수 실행 (트랜잭션 컨텍스트 내에서)
      await Promise.resolve(fn(rollback));

      // 롤백이 요청된 경우
      if (this.context.isRollbackRequested()) {
        this.context.setRolledBack(true);
        return {
          success: false,
          error: 'Transaction rolled back by user request',
        };
      }

      // 수집된 커맨드가 없는 경우
      if (this.context.getCommandCount() === 0) {
        return {
          success: true,
          result: {
            success: true,
            data: {
              message: 'Empty transaction completed successfully',
              commandCount: 0,
            },
          },
        };
      }

      // 모든 커맨드를 BatchOperation으로 묶어서 실행
      const commands = this.context.getCommands();
      const allOperations: IOperation[] = [];

      // 각 커맨드의 operations를 수집
      for (const command of commands) {
        if (command.canExecute(this.operationContext)) {
          const operations = command.createOperations(this.operationContext);
          allOperations.push(...operations);
        } else {
          return {
            success: false,
            error: `Command ${command.name} cannot be executed in transaction`,
          };
        }
      }

      // BatchOperation으로 원자적 실행
      const batchOperation = new BatchOperation(
        allOperations,
        'all-or-nothing',
        this.operationContext,
      );

      const result = await batchOperation.execute();

      return {
        success: result.success,
        result,
        error: result.success ? undefined : result.error,
      };
    } catch (error) {
      this.context.setRolledBack(true);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown transaction error',
      };
    }
  }

  /**
   * 현재 트랜잭션에 커맨드 추가 (내부용)
   */
  addCommand(command: ICommand): void {
    this.context.addCommand(command);
  }

  /**
   * 트랜잭션 컨텍스트 반환 (내부용)
   */
  getContext(): TransactionContext {
    return this.context;
  }
}
