import * as React from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

export default function AlertDialog() {
  const [open, setOpen] = React.useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <React.Fragment>
      <Button variant="outlined" onClick={handleClickOpen}>
        Open alert dialog
      </Button>
      <Dialog
        open={open}
        onClose={handleClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          {"Are you sure you want to stage separately?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            There's another tote for this order of the same temperature type
            located at [location]. Staging separately may increase the time it 
            takes to complete the order.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Stage separately</Button>
          <Button onClick={handleClose} autoFocus>
            Go back
          </Button>
        </DialogActions>
      </Dialog>
    </React.Fragment>
  );
}