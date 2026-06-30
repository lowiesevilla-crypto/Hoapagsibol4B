-- CreateTable
CREATE TABLE `RateLimitEvent` (
    `id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `keyHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RateLimitEvent_action_keyHash_createdAt_idx`(`action`, `keyHash`, `createdAt`),
    INDEX `RateLimitEvent_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
