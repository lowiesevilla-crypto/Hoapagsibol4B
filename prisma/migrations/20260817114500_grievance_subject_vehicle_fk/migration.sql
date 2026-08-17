-- Preserve grievance subject history by preventing deletion of a vehicle while a structured complaint subject still references it.
ALTER TABLE `ComplaintSubject`
  ADD CONSTRAINT `ComplaintSubject_vehicleId_fkey`
  FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
